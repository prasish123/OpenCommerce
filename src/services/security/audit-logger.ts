import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * PCI-Compliant Audit Logger
 * Logs all security-relevant events for PCI DSS compliance
 *
 * PCI DSS Requirement 10: Track and monitor all access to network resources and cardholder data
 */

export enum AuditEventType {
  // Authentication Events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  SESSION_TIMEOUT = 'SESSION_TIMEOUT',

  // Payment Events
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REFUND = 'PAYMENT_REFUND',
  PAYMENT_VOID = 'PAYMENT_VOID',

  // Transaction Events
  TRANSACTION_CREATED = 'TRANSACTION_CREATED',
  TRANSACTION_VOIDED = 'TRANSACTION_VOIDED',
  PRICE_OVERRIDE = 'PRICE_OVERRIDE',
  MANUAL_DISCOUNT = 'MANUAL_DISCOUNT',

  // Access Control Events
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',

  // Data Access Events
  CARDHOLDER_DATA_ACCESS = 'CARDHOLDER_DATA_ACCESS',
  SENSITIVE_DATA_EXPORT = 'SENSITIVE_DATA_EXPORT',
  REPORT_GENERATED = 'REPORT_GENERATED',

  // Configuration Events
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  USER_CREATED = 'USER_CREATED',
  USER_MODIFIED = 'USER_MODIFIED',
  USER_DELETED = 'USER_DELETED',

  // Security Events
  ENCRYPTION_KEY_ROTATED = 'ENCRYPTION_KEY_ROTATED',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',

  // System Events
  SYSTEM_STARTUP = 'SYSTEM_STARTUP',
  SYSTEM_SHUTDOWN = 'SYSTEM_SHUTDOWN',
  DATABASE_BACKUP = 'DATABASE_BACKUP',
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  username?: string;
  ipAddress?: string;
  terminalId?: string;
  description: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class AuditLogger {
  /**
   * Log audit event to database (tamper-proof, append-only)
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: uuidv4(),
      ...event,
      timestamp: new Date(),
    };

    try {
      // Insert into audit_logs table (append-only, no updates/deletes allowed)
      await db.query(
        `INSERT INTO compliance_service.audit_logs (
          id, event_type, severity, user_id, username,
          ip_address, terminal_id, description, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          auditEvent.id,
          auditEvent.eventType,
          auditEvent.severity,
          auditEvent.userId || null,
          auditEvent.username || null,
          auditEvent.ipAddress || null,
          auditEvent.terminalId || null,
          auditEvent.description,
          auditEvent.metadata ? JSON.stringify(auditEvent.metadata) : null,
          auditEvent.timestamp,
        ]
      );

      // Also log to Winston for real-time monitoring
      log.info('AUDIT', {
        eventType: auditEvent.eventType,
        severity: auditEvent.severity,
        userId: auditEvent.userId,
        description: auditEvent.description,
      });
    } catch (error) {
      // Critical: If audit logging fails, we must know
      log.error('CRITICAL: Audit logging failed', error);
      throw new Error('Audit logging failed - this is a PCI compliance violation');
    }
  }

  /**
   * Log successful login
   */
  async logLogin(userId: string, username: string, ipAddress?: string, terminalId?: string): Promise<void> {
    await this.log({
      eventType: AuditEventType.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      userId,
      username,
      ipAddress,
      terminalId,
      description: `User ${username} logged in successfully`,
    });
  }

  /**
   * Log failed login attempt
   */
  async logFailedLogin(username: string, ipAddress?: string, reason?: string): Promise<void> {
    await this.log({
      eventType: AuditEventType.LOGIN_FAILURE,
      severity: AuditSeverity.WARNING,
      username,
      ipAddress,
      description: `Failed login attempt for user ${username}`,
      metadata: { reason },
    });
  }

  /**
   * Log payment event
   */
  async logPayment(
    eventType: AuditEventType,
    userId: string,
    transactionId: string,
    amount: number,
    last4?: string
  ): Promise<void> {
    await this.log({
      eventType,
      severity: AuditSeverity.INFO,
      userId,
      description: `Payment event: ${eventType}`,
      metadata: {
        transactionId,
        amount,
        last4: last4 || 'N/A', // Only store last 4 digits
      },
    });
  }

  /**
   * Log privilege escalation (manager override)
   */
  async logPrivilegeEscalation(
    userId: string,
    username: string,
    action: string,
    managerId: string,
    managerUsername: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.PRIVILEGE_ESCALATION,
      severity: AuditSeverity.WARNING,
      userId,
      username,
      description: `Manager override: ${action}`,
      metadata: {
        action,
        managerId,
        managerUsername,
      },
    });
  }

  /**
   * Log security violation
   */
  async logSecurityViolation(
    description: string,
    userId?: string,
    ipAddress?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.SECURITY_VIOLATION,
      severity: AuditSeverity.CRITICAL,
      userId,
      ipAddress,
      description,
      metadata,
    });
  }

  /**
   * Log cardholder data access
   */
  async logCardholderDataAccess(
    userId: string,
    username: string,
    reason: string,
    transactionId?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.CARDHOLDER_DATA_ACCESS,
      severity: AuditSeverity.WARNING,
      userId,
      username,
      description: `Cardholder data accessed: ${reason}`,
      metadata: { transactionId, reason },
    });
  }

  /**
   * Log configuration change
   */
  async logConfigChange(
    userId: string,
    username: string,
    configKey: string,
    oldValue: any,
    newValue: any
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.CONFIG_CHANGED,
      severity: AuditSeverity.WARNING,
      userId,
      username,
      description: `Configuration changed: ${configKey}`,
      metadata: {
        configKey,
        oldValue: this.sanitizeValue(oldValue),
        newValue: this.sanitizeValue(newValue),
      },
    });
  }

  /**
   * Query audit logs (for compliance reports)
   */
  async queryLogs(filters: {
    startDate?: Date;
    endDate?: Date;
    eventType?: AuditEventType;
    userId?: string;
    severity?: AuditSeverity;
    limit?: number;
  }): Promise<AuditEvent[]> {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filters.eventType);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(filters.severity);
    }

    const limit = filters.limit || 100;
    const query = `
      SELECT
        id, event_type as "eventType", severity, user_id as "userId",
        username, ip_address as "ipAddress", terminal_id as "terminalId",
        description, metadata, created_at as "timestamp"
      FROM compliance_service.audit_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const result = await db.query(query, params);

    return result.rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  /**
   * Sanitize sensitive values from logs (don't log passwords, keys, etc.)
   */
  private sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      // Mask potential secrets
      const sensitivePatterns = [
        /password/i,
        /secret/i,
        /key/i,
        /token/i,
        /api[_-]?key/i,
      ];

      for (const pattern of sensitivePatterns) {
        if (pattern.test(value)) {
          return '***REDACTED***';
        }
      }
    }

    return value;
  }

  /**
   * Generate compliance report (for PCI audits)
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    securityViolations: number;
    failedLogins: number;
  }> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        event_type,
        severity
      FROM compliance_service.audit_logs
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY event_type, severity`,
      [startDate, endDate]
    );

    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    let totalEvents = 0;
    let securityViolations = 0;
    let failedLogins = 0;

    for (const row of result.rows) {
      const count = parseInt(row.total);
      totalEvents += count;

      eventsByType[row.event_type] = (eventsByType[row.event_type] || 0) + count;
      eventsBySeverity[row.severity] = (eventsBySeverity[row.severity] || 0) + count;

      if (row.event_type === AuditEventType.SECURITY_VIOLATION) {
        securityViolations += count;
      }

      if (row.event_type === AuditEventType.LOGIN_FAILURE) {
        failedLogins += count;
      }
    }

    return {
      totalEvents,
      eventsByType,
      eventsBySeverity,
      securityViolations,
      failedLogins,
    };
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();
