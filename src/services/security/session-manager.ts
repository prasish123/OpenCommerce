import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { auditLogger, AuditEventType, AuditSeverity } from './audit-logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Session Manager
 * PCI DSS Requirement 8.1.8: Sessions must timeout after 15 minutes of inactivity
 * PCI DSS Requirement 8.2: Multi-factor authentication for remote access
 */

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  terminalId?: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
}

export class SessionManager {
  private readonly SESSION_TIMEOUT_MINUTES = 15; // PCI requirement
  private readonly MAX_SESSIONS_PER_USER = 3; // Limit concurrent sessions

  /**
   * Create new session
   */
  async createSession(
    userId: string,
    username: string,
    ipAddress?: string,
    userAgent?: string,
    terminalId?: string
  ): Promise<UserSession> {
    // Generate secure session token
    const token = this.generateSecureToken();
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_TIMEOUT_MINUTES * 60 * 1000);

    // Check for existing active sessions
    const existingSessions = await this.getActiveSessions(userId);

    // Limit concurrent sessions
    if (existingSessions.length >= this.MAX_SESSIONS_PER_USER) {
      // Terminate oldest session
      await this.terminateSession(existingSessions[0].id, 'MAX_SESSIONS_EXCEEDED');
    }

    // Create session in database
    await db.query(
      `INSERT INTO compliance_service.user_sessions (
        id, user_id, token, ip_address, user_agent,
        terminal_id, created_at, last_activity, expires_at, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        sessionId,
        userId,
        token,
        ipAddress || null,
        userAgent || null,
        terminalId || null,
        now,
        now,
        expiresAt,
        true,
      ]
    );

    // Audit log
    await auditLogger.logLogin(userId, username, ipAddress, terminalId);

    log.info('Session created', {
      sessionId,
      userId,
      username,
      expiresAt,
    });

    return {
      id: sessionId,
      userId,
      token,
      ipAddress,
      userAgent,
      terminalId,
      createdAt: now,
      lastActivity: now,
      expiresAt,
      isActive: true,
    };
  }

  /**
   * Validate session and refresh activity timestamp
   */
  async validateSession(token: string): Promise<UserSession | null> {
    const result = await db.query(
      `SELECT
        id, user_id as "userId", token, ip_address as "ipAddress",
        user_agent as "userAgent", terminal_id as "terminalId",
        created_at as "createdAt", last_activity as "lastActivity",
        expires_at as "expiresAt", is_active as "isActive"
      FROM compliance_service.user_sessions
      WHERE token = $1 AND is_active = true`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    const now = new Date();

    // Check if session expired
    if (new Date(session.expiresAt) < now) {
      await this.terminateSession(session.id, 'TIMEOUT');
      return null;
    }

    // Refresh session activity and extend timeout
    const newExpiresAt = new Date(now.getTime() + this.SESSION_TIMEOUT_MINUTES * 60 * 1000);

    await db.query(
      `UPDATE compliance_service.user_sessions
       SET last_activity = $1, expires_at = $2
       WHERE id = $3`,
      [now, newExpiresAt, session.id]
    );

    session.lastActivity = now;
    session.expiresAt = newExpiresAt;

    return session;
  }

  /**
   * Terminate session (logout)
   */
  async terminateSession(sessionId: string, reason: string): Promise<void> {
    // Get session info for audit log
    const result = await db.query(
      `SELECT user_id, token FROM compliance_service.user_sessions WHERE id = $1`,
      [sessionId]
    );

    if (result.rows.length > 0) {
      const { user_id } = result.rows[0];

      // Deactivate session
      await db.query(
        `UPDATE compliance_service.user_sessions
         SET is_active = false
         WHERE id = $1`,
        [sessionId]
      );

      // Audit log
      const eventType =
        reason === 'TIMEOUT'
          ? AuditEventType.SESSION_TIMEOUT
          : AuditEventType.LOGOUT;

      await auditLogger.log({
        eventType,
        severity: AuditSeverity.INFO,
        userId: user_id,
        description: `Session terminated: ${reason}`,
        metadata: { sessionId, reason },
      });

      log.info('Session terminated', { sessionId, reason });
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getActiveSessions(userId: string): Promise<UserSession[]> {
    const result = await db.query(
      `SELECT
        id, user_id as "userId", token, ip_address as "ipAddress",
        user_agent as "userAgent", terminal_id as "terminalId",
        created_at as "createdAt", last_activity as "lastActivity",
        expires_at as "expiresAt", is_active as "isActive"
      FROM compliance_service.user_sessions
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at ASC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Terminate all sessions for a user (password reset, security breach)
   */
  async terminateAllUserSessions(userId: string, reason: string): Promise<void> {
    await db.query(
      `UPDATE compliance_service.user_sessions
       SET is_active = false
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    await auditLogger.log({
      eventType: AuditEventType.SECURITY_VIOLATION,
      severity: AuditSeverity.WARNING,
      userId,
      description: `All sessions terminated: ${reason}`,
      metadata: { reason },
    });

    log.warn('All user sessions terminated', { userId, reason });
  }

  /**
   * Cleanup expired sessions (run periodically)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await db.query(
      `UPDATE compliance_service.user_sessions
       SET is_active = false
       WHERE expires_at < NOW() AND is_active = true
       RETURNING id`
    );

    const count = result.rowCount || 0;

    if (count > 0) {
      log.info('Expired sessions cleaned up', { count });
    }

    return count;
  }

  /**
   * Generate secure random token for session
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Track failed login attempts (PCI DSS Requirement 8.1.6)
   */
  async recordFailedLogin(
    username: string,
    ipAddress?: string,
    terminalId?: string,
    reason?: string
  ): Promise<void> {
    const id = uuidv4();

    await db.query(
      `INSERT INTO compliance_service.failed_login_attempts (
        id, username, ip_address, terminal_id, attempt_time, reason
      ) VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [id, username, ipAddress || null, terminalId || null, reason || 'Invalid credentials']
    );

    // Check if account should be locked
    const recentAttempts = await this.getRecentFailedAttempts(username, 30); // Last 30 minutes

    if (recentAttempts >= 6) {
      await this.lockAccount(username, 'TOO_MANY_FAILED_ATTEMPTS');
    }

    // Audit log
    await auditLogger.logFailedLogin(username, ipAddress, reason);
  }

  /**
   * Get count of recent failed login attempts
   */
  private async getRecentFailedAttempts(username: string, minutes: number): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM compliance_service.failed_login_attempts
       WHERE username = $1
         AND attempt_time > NOW() - INTERVAL '${minutes} minutes'`,
      [username]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Lock user account (PCI DSS Requirement 8.1.6)
   */
  async lockAccount(username: string, reason: string): Promise<void> {
    // Get user ID
    const userResult = await db.query(
      `SELECT id FROM auth_service.users WHERE username = $1`,
      [username]
    );

    if (userResult.rows.length === 0) {
      return;
    }

    const userId = userResult.rows[0].id;
    const unlockAt = new Date(Date.now() + 30 * 60 * 1000); // Auto-unlock after 30 minutes

    // Create lockout record
    await db.query(
      `INSERT INTO compliance_service.account_lockouts (
        id, user_id, username, locked_at, unlock_at, is_locked, reason
      ) VALUES ($1, $2, $3, NOW(), $4, true, $5)`,
      [uuidv4(), userId, username, unlockAt, reason]
    );

    // Terminate all active sessions
    await this.terminateAllUserSessions(userId, 'ACCOUNT_LOCKED');

    // Audit log
    await auditLogger.log({
      eventType: AuditEventType.SECURITY_VIOLATION,
      severity: AuditSeverity.CRITICAL,
      userId,
      username,
      description: `Account locked: ${reason}`,
      metadata: { reason, unlockAt },
    });

    log.warn('Account locked', { username, reason, unlockAt });
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(username: string): Promise<boolean> {
    const result = await db.query(
      `SELECT id FROM compliance_service.account_lockouts
       WHERE username = $1
         AND is_locked = true
         AND (unlock_at IS NULL OR unlock_at > NOW())`,
      [username]
    );

    return result.rows.length > 0;
  }

  /**
   * Unlock account (admin action)
   */
  async unlockAccount(username: string, unlockedBy: string): Promise<void> {
    await db.query(
      `UPDATE compliance_service.account_lockouts
       SET is_locked = false, unlocked_by = $1
       WHERE username = $2 AND is_locked = true`,
      [unlockedBy, username]
    );

    await auditLogger.log({
      eventType: AuditEventType.PRIVILEGE_ESCALATION,
      severity: AuditSeverity.WARNING,
      username,
      description: `Account unlocked by admin`,
      metadata: { unlockedBy },
    });

    log.info('Account unlocked', { username, unlockedBy });
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
