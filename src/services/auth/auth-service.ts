import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { auditLogger, AuditEventType, AuditSeverity } from '../security/audit-logger';
import { sessionManager } from '../security/session-manager';
import { encryptionService } from '../security/encryption-service';
import jwt from 'jsonwebtoken';
import { config } from '../../shared/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Authentication Service
 * Handles user login, PIN authentication, JWT tokens, RBAC, password management
 */

export enum UserRole {
  CASHIER = 'CASHIER',
  MANAGER = 'MANAGER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export interface User {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  pinCode?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  sessionId?: string;
  error?: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  sessionId: string;
}

export class AuthenticationService {
  /**
   * Login with username and password
   */
  async login(
    username: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
    terminalId?: string
  ): Promise<AuthResult> {
    try {
      // Check if account is locked
      const isLocked = await sessionManager.isAccountLocked(username);
      if (isLocked) {
        return {
          success: false,
          error: 'Account is locked due to too many failed login attempts. Please contact your manager.',
        };
      }

      // Get user from database
      const result = await db.query(
        `SELECT
          id, username, email, role, password_hash, password_salt,
          pin_code, is_active, last_login, created_at
        FROM auth_service.users
        WHERE username = $1`,
        [username]
      );

      if (result.rows.length === 0) {
        await sessionManager.recordFailedLogin(username, ipAddress, terminalId, 'User not found');
        return { success: false, error: 'Invalid username or password' };
      }

      const user = result.rows[0];

      // Check if user is active
      if (!user.is_active) {
        await auditLogger.log({
          eventType: AuditEventType.LOGIN_FAILURE,
          severity: AuditSeverity.WARNING,
          username,
          ipAddress,
          description: 'Login attempt for inactive user',
        });
        return { success: false, error: 'Account is inactive. Please contact your manager.' };
      }

      // Verify password
      const isValid = encryptionService.verifyHash(password, user.password_hash, user.password_salt);

      if (!isValid) {
        await sessionManager.recordFailedLogin(username, ipAddress, terminalId, 'Invalid password');
        return { success: false, error: 'Invalid username or password' };
      }

      // Create session
      const session = await sessionManager.createSession(
        user.id,
        username,
        ipAddress,
        userAgent,
        terminalId
      );

      // Generate JWT token
      const token = this.generateJWT({
        userId: user.id,
        username: user.username,
        role: user.role,
        sessionId: session.id,
      });

      // Update last login
      await db.query(
        `UPDATE auth_service.users SET last_login = NOW() WHERE id = $1`,
        [user.id]
      );

      log.info('User logged in', { userId: user.id, username, role: user.role });

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.is_active,
          lastLogin: user.last_login,
          createdAt: user.created_at,
        },
        token,
        sessionId: session.id,
      };
    } catch (error) {
      log.error('Login failed', error);
      return { success: false, error: 'Login failed. Please try again.' };
    }
  }

  /**
   * Login with PIN code (for POS terminals)
   */
  async loginWithPIN(
    pinCode: string,
    ipAddress?: string,
    terminalId?: string
  ): Promise<AuthResult> {
    try {
      // Hash PIN for comparison
      const { hash: pinHash } = encryptionService.hash(pinCode);

      // Get user by PIN
      const result = await db.query(
        `SELECT
          id, username, email, role, pin_code, pin_salt,
          is_active, last_login, created_at
        FROM auth_service.users
        WHERE pin_code IS NOT NULL AND is_active = true`
      );

      // Find user with matching PIN
      let matchedUser = null;
      for (const user of result.rows) {
        const isValid = encryptionService.verifyHash(pinCode, user.pin_code, user.pin_salt);
        if (isValid) {
          matchedUser = user;
          break;
        }
      }

      if (!matchedUser) {
        await sessionManager.recordFailedLogin(
          `PIN:${pinCode.substring(0, 2)}**`,
          ipAddress,
          terminalId,
          'Invalid PIN'
        );
        return { success: false, error: 'Invalid PIN code' };
      }

      // Create session
      const session = await sessionManager.createSession(
        matchedUser.id,
        matchedUser.username,
        ipAddress,
        undefined,
        terminalId
      );

      // Generate JWT token
      const token = this.generateJWT({
        userId: matchedUser.id,
        username: matchedUser.username,
        role: matchedUser.role,
        sessionId: session.id,
      });

      // Update last login
      await db.query(
        `UPDATE auth_service.users SET last_login = NOW() WHERE id = $1`,
        [matchedUser.id]
      );

      log.info('User logged in with PIN', {
        userId: matchedUser.id,
        username: matchedUser.username,
        terminalId,
      });

      return {
        success: true,
        user: {
          id: matchedUser.id,
          username: matchedUser.username,
          email: matchedUser.email,
          role: matchedUser.role,
          isActive: matchedUser.is_active,
          lastLogin: matchedUser.last_login,
          createdAt: matchedUser.created_at,
        },
        token,
        sessionId: session.id,
      };
    } catch (error) {
      log.error('PIN login failed', error);
      return { success: false, error: 'Login failed. Please try again.' };
    }
  }

  /**
   * Verify JWT token and session
   */
  async verifyToken(token: string): Promise<{ valid: boolean; payload?: JWTPayload; user?: User }> {
    try {
      // Verify JWT
      const payload = jwt.verify(token, config.security.jwtSecret) as JWTPayload;

      // Verify session is still active
      const session = await sessionManager.validateSession(payload.sessionId);
      if (!session) {
        return { valid: false };
      }

      // Get user
      const result = await db.query(
        `SELECT id, username, email, role, is_active, last_login, created_at
         FROM auth_service.users
         WHERE id = $1 AND is_active = true`,
        [payload.userId]
      );

      if (result.rows.length === 0) {
        return { valid: false };
      }

      const user = result.rows[0];

      return {
        valid: true,
        payload,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.is_active,
          lastLogin: user.last_login,
          createdAt: user.created_at,
        },
      };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Logout user
   */
  async logout(sessionId: string): Promise<void> {
    await sessionManager.terminateSession(sessionId, 'USER_LOGOUT');
  }

  /**
   * Create new user
   */
  async createUser(
    username: string,
    password: string,
    role: UserRole,
    email?: string,
    pinCode?: string,
    createdBy?: string
  ): Promise<User> {
    // Hash password
    const { hash: passwordHash, salt: passwordSalt } = encryptionService.hash(password);

    // Hash PIN if provided
    let pinHash = null;
    let pinSalt = null;
    if (pinCode) {
      const pin = encryptionService.hash(pinCode);
      pinHash = pin.hash;
      pinSalt = pin.salt;
    }

    const userId = uuidv4();

    await db.query(
      `INSERT INTO auth_service.users (
        id, username, email, role, password_hash, password_salt,
        pin_code, pin_salt, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())`,
      [userId, username, email || null, role, passwordHash, passwordSalt, pinHash, pinSalt]
    );

    // Record in password history
    await db.query(
      `INSERT INTO compliance_service.password_history (
        id, user_id, password_hash, password_salt, created_at
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), userId, passwordHash, passwordSalt]
    );

    // Audit log
    await auditLogger.log({
      eventType: AuditEventType.USER_CREATED,
      severity: AuditSeverity.INFO,
      userId: createdBy || null,
      description: `User created: ${username} with role ${role}`,
      metadata: { newUserId: userId, username, role },
    });

    log.info('User created', { userId, username, role });

    return {
      id: userId,
      username,
      email: email || undefined,
      role,
      pinCode: pinCode || undefined,
      isActive: true,
      createdAt: new Date(),
    };
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    // Get user
    const result = await db.query(
      `SELECT password_hash, password_salt, username
       FROM auth_service.users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'User not found' };
    }

    const user = result.rows[0];

    // Verify old password
    const isValid = encryptionService.verifyHash(oldPassword, user.password_hash, user.password_salt);
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Check password history (prevent reuse of last 4 passwords)
    const historyResult = await db.query(
      `SELECT password_hash, password_salt
       FROM compliance_service.password_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 4`,
      [userId]
    );

    for (const historyEntry of historyResult.rows) {
      const isReused = encryptionService.verifyHash(
        newPassword,
        historyEntry.password_hash,
        historyEntry.password_salt
      );
      if (isReused) {
        return {
          success: false,
          error: 'Cannot reuse any of your last 4 passwords',
        };
      }
    }

    // Hash new password
    const { hash: newHash, salt: newSalt } = encryptionService.hash(newPassword);

    // Update password
    await db.query(
      `UPDATE auth_service.users
       SET password_hash = $1, password_salt = $2, updated_at = NOW()
       WHERE id = $3`,
      [newHash, newSalt, userId]
    );

    // Add to password history
    await db.query(
      `INSERT INTO compliance_service.password_history (
        id, user_id, password_hash, password_salt, created_at
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), userId, newHash, newSalt]
    );

    // Terminate all sessions (force re-login)
    await sessionManager.terminateAllUserSessions(userId, 'PASSWORD_CHANGED');

    // Audit log
    await auditLogger.log({
      eventType: AuditEventType.USER_MODIFIED,
      severity: AuditSeverity.WARNING,
      userId,
      username: user.username,
      description: 'Password changed',
    });

    log.info('Password changed', { userId, username: user.username });

    return { success: true };
  }

  /**
   * Set or change PIN code
   */
  async setPIN(
    userId: string,
    pinCode: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate PIN (4-6 digits)
    if (!/^\d{4,6}$/.test(pinCode)) {
      return { success: false, error: 'PIN must be 4-6 digits' };
    }

    // Hash PIN
    const { hash: pinHash, salt: pinSalt } = encryptionService.hash(pinCode);

    // Update user
    await db.query(
      `UPDATE auth_service.users
       SET pin_code = $1, pin_salt = $2, updated_at = NOW()
       WHERE id = $3`,
      [pinHash, pinSalt, userId]
    );

    // Audit log
    await auditLogger.log({
      eventType: AuditEventType.USER_MODIFIED,
      severity: AuditSeverity.INFO,
      userId,
      description: 'PIN code set',
    });

    log.info('PIN code set', { userId });

    return { success: true };
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM auth_service.user_permissions up
       JOIN auth_service.permissions p ON up.permission_id = p.id
       WHERE up.user_id = $1 AND p.permission_name = $2`,
      [userId, permission]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Check if role has permission
   */
  hasRolePermission(role: UserRole, permission: string): boolean {
    const rolePermissions: Record<UserRole, string[]> = {
      [UserRole.CASHIER]: [
        'pos.scan',
        'pos.payment',
        'pos.receipt',
        'order.view',
        'order.update',
      ],
      [UserRole.MANAGER]: [
        'pos.*',
        'order.*',
        'inventory.view',
        'reports.view',
        'user.view',
        'transaction.void',
        'transaction.discount',
        'drawer.open',
      ],
      [UserRole.ADMIN]: [
        'pos.*',
        'order.*',
        'inventory.*',
        'reports.*',
        'user.*',
        'settings.view',
        'settings.update',
      ],
      [UserRole.SUPER_ADMIN]: ['*'],
    };

    const permissions = rolePermissions[role] || [];

    // Check wildcard
    if (permissions.includes('*')) {
      return true;
    }

    // Check exact match
    if (permissions.includes(permission)) {
      return true;
    }

    // Check wildcard suffix (e.g., "pos.*" matches "pos.scan")
    const wildcards = permissions.filter((p) => p.endsWith('.*'));
    for (const wildcard of wildcards) {
      const prefix = wildcard.slice(0, -2);
      if (permission.startsWith(prefix + '.')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate JWT token
   */
  private generateJWT(payload: JWTPayload): string {
    return jwt.sign(payload, config.security.jwtSecret, {
      expiresIn: '24h',
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const result = await db.query(
      `SELECT id, username, email, role, is_active, last_login, created_at
       FROM auth_service.users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      lastLogin: user.last_login,
      createdAt: user.created_at,
    };
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<User[]> {
    const result = await db.query(
      `SELECT id, username, email, role, is_active, last_login, created_at
       FROM auth_service.users
       ORDER BY username`
    );

    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
      lastLogin: row.last_login,
      createdAt: row.created_at,
    }));
  }

  /**
   * Verify manager PIN for override actions
   * Creates a temporary 5-minute authorization for sensitive operations
   */
  async verifyManagerOverride(
    pinCode: string,
    action: string,
    ipAddress?: string,
    terminalId?: string
  ): Promise<{
    success: boolean;
    managerId?: string;
    managerRole?: UserRole;
    overrideToken?: string;
    error?: string;
  }> {
    try {
      // Get all active users with manager+ roles
      const result = await db.query(
        `SELECT id, username, role, pin_code, pin_salt, is_active
         FROM auth_service.users
         WHERE pin_code IS NOT NULL
         AND is_active = true
         AND role IN ('MANAGER', 'ADMIN', 'SUPER_ADMIN')`
      );

      // Find user with matching PIN
      let matchedManager = null;
      for (const user of result.rows) {
        const isValid = encryptionService.verifyHash(pinCode, user.pin_code, user.pin_salt);
        if (isValid) {
          matchedManager = user;
          break;
        }
      }

      if (!matchedManager) {
        // Log failed override attempt
        await auditLogger.log({
          eventType: AuditEventType.AUTHORIZATION_FAILURE,
          severity: AuditSeverity.WARNING,
          ipAddress,
          description: `Failed manager override attempt for action: ${action}`,
          metadata: {
            action,
            terminalId,
            pinAttempt: `${pinCode.substring(0, 2)}**`,
          },
        });

        return { success: false, error: 'Invalid manager PIN' };
      }

      // Check if user has permission for this action
      const hasPermission = this.hasRolePermission(matchedManager.role, action);
      if (!hasPermission) {
        await auditLogger.log({
          eventType: AuditEventType.AUTHORIZATION_FAILURE,
          severity: AuditSeverity.WARNING,
          userId: matchedManager.id,
          username: matchedManager.username,
          ipAddress,
          description: `Manager lacks permission for action: ${action}`,
          metadata: {
            action,
            role: matchedManager.role,
            terminalId,
          },
        });

        return {
          success: false,
          error: 'Insufficient permissions for this action',
        };
      }

      // Generate short-lived override token (5 minutes)
      const overrideToken = jwt.sign(
        {
          managerId: matchedManager.id,
          action,
          type: 'MANAGER_OVERRIDE',
        },
        config.security.jwtSecret,
        { expiresIn: '5m' }
      );

      // Log successful override
      await auditLogger.log({
        eventType: AuditEventType.MANAGER_OVERRIDE,
        severity: AuditSeverity.INFO,
        userId: matchedManager.id,
        username: matchedManager.username,
        ipAddress,
        description: `Manager override authorized for action: ${action}`,
        metadata: {
          action,
          role: matchedManager.role,
          terminalId,
        },
      });

      log.info('Manager override authorized', {
        managerId: matchedManager.id,
        action,
        role: matchedManager.role,
      });

      return {
        success: true,
        managerId: matchedManager.id,
        managerRole: matchedManager.role,
        overrideToken,
      };
    } catch (error) {
      log.error('Manager override verification failed', error);
      return { success: false, error: 'Verification failed. Please try again.' };
    }
  }

  /**
   * Verify override token is still valid
   */
  async verifyOverrideToken(
    overrideToken: string,
    expectedAction: string
  ): Promise<{ valid: boolean; managerId?: string }> {
    try {
      const payload = jwt.verify(overrideToken, config.security.jwtSecret) as any;

      if (payload.type !== 'MANAGER_OVERRIDE') {
        return { valid: false };
      }

      if (payload.action !== expectedAction) {
        return { valid: false };
      }

      return { valid: true, managerId: payload.managerId };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string, deactivatedBy: string): Promise<void> {
    await db.query(
      `UPDATE auth_service.users SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // Terminate all sessions
    await sessionManager.terminateAllUserSessions(userId, 'USER_DEACTIVATED');

    // Audit log
    await auditLogger.log({
      eventType: AuditEventType.USER_MODIFIED,
      severity: AuditSeverity.WARNING,
      userId: deactivatedBy,
      description: `User deactivated: ${userId}`,
      metadata: { deactivatedUserId: userId },
    });

    log.info('User deactivated', { userId, deactivatedBy });
  }
}

// Singleton instance
export const authService = new AuthenticationService();
