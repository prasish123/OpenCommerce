/**
 * Comprehensive Logging System
 * - Application logs
 * - Server logs
 * - Cloud logs (Sentry, Datadog, CloudWatch)
 * - Bidirectional sync
 * - Real-time monitoring
 */

import winston from 'winston';
import * as Sentry from '@sentry/node';
import { config } from '../../shared/config';
import { db } from '../../shared/database';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// LOG LEVELS
// ==========================================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum LogCategory {
  APPLICATION = 'application',
  SERVER = 'server',
  DATABASE = 'database',
  PAYMENT = 'payment',
  SYNC = 'sync',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  AUDIT = 'audit',
}

// ==========================================
// LOG ENTRY INTERFACE
// ==========================================

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata?: Record<string, any>;
  storeId?: string;
  terminalId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  stackTrace?: string;
  synced: boolean;
  syncedAt?: Date;
}

// ==========================================
// WINSTON LOGGER CONFIGURATION
// ==========================================

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, category, ...meta } = info;
    return JSON.stringify({
      timestamp,
      level,
      category: category || LogCategory.APPLICATION,
      message,
      ...meta,
    });
  })
);

// ==========================================
// WINSTON TRANSPORTS
// ==========================================

const transports: winston.transport[] = [
  // Console output (local development)
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), customFormat),
    level: config.logging?.level || 'info',
  }),

  // File output - All logs
  new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    tailable: true,
  }),

  // File output - Error logs only
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
  }),

  // File output - Payment logs (PCI compliance)
  new winston.transports.File({
    filename: 'logs/payment.log',
    level: 'info',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 30, // Keep 30 days for compliance
  }),
];

// Add cloud transport in production
if (config.env === 'production' && config.logging?.cloudProvider) {
  // Sentry for error tracking
  if (config.sentry?.dsn) {
    Sentry.init({
      dsn: config.sentry.dsn,
      environment: config.env,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      beforeSend(event) {
        // Scrub sensitive data
        if (event.request?.data) {
          event.request.data = scrubSensitiveData(event.request.data);
        }
        return event;
      },
    });
  }

  // Add CloudWatch transport (AWS)
  if (config.logging.cloudProvider === 'aws') {
    const CloudWatchTransport = require('winston-cloudwatch');
    transports.push(
      new CloudWatchTransport({
        logGroupName: `/opencommerce/${config.env}/application`,
        logStreamName: `${config.store.id}-${new Date().toISOString().split('T')[0]}`,
        awsRegion: config.aws?.region || 'us-east-1',
        messageFormatter: (log: any) => JSON.stringify(log),
      })
    );
  }

  // Add Datadog transport
  if (config.logging.cloudProvider === 'datadog' && config.datadog?.apiKey) {
    const DatadogTransport = require('datadog-winston');
    transports.push(
      new DatadogTransport({
        apiKey: config.datadog.apiKey,
        hostname: config.store.id,
        service: 'opencommerce-pos',
        ddsource: 'nodejs',
        ddtags: `env:${config.env},store:${config.store.id}`,
      })
    );
  }
}

const winstonLogger = winston.createLogger({
  format: customFormat,
  transports,
  exitOnError: false,
});

// ==========================================
// COMPREHENSIVE LOGGER CLASS
// ==========================================

export class ComprehensiveLogger {
  private static instance: ComprehensiveLogger;
  private winston: winston.Logger;
  private buffer: LogEntry[] = [];
  private syncInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.winston = winstonLogger;
    this.startSyncInterval();
  }

  static getInstance(): ComprehensiveLogger {
    if (!ComprehensiveLogger.instance) {
      ComprehensiveLogger.instance = new ComprehensiveLogger();
    }
    return ComprehensiveLogger.instance;
  }

  /**
   * Log at DEBUG level
   */
  debug(
    message: string,
    category: LogCategory = LogCategory.APPLICATION,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.DEBUG, category, message, metadata);
  }

  /**
   * Log at INFO level
   */
  info(
    message: string,
    category: LogCategory = LogCategory.APPLICATION,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.INFO, category, message, metadata);
  }

  /**
   * Log at WARN level
   */
  warn(
    message: string,
    category: LogCategory = LogCategory.APPLICATION,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.WARN, category, message, metadata);
  }

  /**
   * Log at ERROR level
   */
  error(
    message: string,
    category: LogCategory = LogCategory.APPLICATION,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const meta = {
      ...metadata,
      error: error?.message,
      stack: error?.stack,
    };

    this.log(LogLevel.ERROR, category, message, meta);

    // Send to Sentry for critical errors
    if (config.sentry?.dsn) {
      Sentry.captureException(error || new Error(message), {
        level: 'error',
        tags: {
          category,
          storeId: config.store.id,
        },
        extra: metadata,
      });
    }
  }

  /**
   * Log at CRITICAL level
   */
  critical(
    message: string,
    category: LogCategory = LogCategory.APPLICATION,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const meta = {
      ...metadata,
      error: error?.message,
      stack: error?.stack,
    };

    this.log(LogLevel.CRITICAL, category, message, meta);

    // Send to Sentry for critical errors
    if (config.sentry?.dsn) {
      Sentry.captureException(error || new Error(message), {
        level: 'fatal',
        tags: {
          category,
          storeId: config.store.id,
        },
        extra: metadata,
      });
    }

    // Send alert notification (email, SMS, PagerDuty, etc.)
    this.sendCriticalAlert(message, metadata);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    metadata?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      level,
      category,
      message,
      metadata: scrubSensitiveData(metadata),
      storeId: config.store.id,
      terminalId: metadata?.terminalId,
      userId: metadata?.userId,
      sessionId: metadata?.sessionId,
      requestId: metadata?.requestId,
      stackTrace: metadata?.stack,
      synced: false,
    };

    // Write to Winston (files, console, cloud)
    this.winston.log(level, message, {
      category,
      ...logEntry.metadata,
    });

    // Buffer for database sync
    this.buffer.push(logEntry);

    // Immediate sync for critical/error logs
    if (level === LogLevel.CRITICAL || level === LogLevel.ERROR) {
      this.syncToDatabase([logEntry]);
    }
  }

  /**
   * Payment-specific logging (PCI compliance)
   */
  logPayment(
    action: string,
    amount: number,
    paymentIntentId?: string,
    metadata?: Record<string, any>
  ): void {
    const scrubbedMeta = scrubSensitiveData(metadata);

    this.info(
      `Payment ${action}: $${amount.toFixed(2)}`,
      LogCategory.PAYMENT,
      {
        action,
        amount,
        paymentIntentId,
        ...scrubbedMeta,
      }
    );

    // Immediately persist to database for audit trail
    const logEntry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      level: LogLevel.INFO,
      category: LogCategory.PAYMENT,
      message: `Payment ${action}: $${amount.toFixed(2)}`,
      metadata: {
        action,
        amount,
        paymentIntentId,
        ...scrubbedMeta,
      },
      storeId: config.store.id,
      synced: false,
    };

    this.syncToDatabase([logEntry]);
  }

  /**
   * Security event logging
   */
  logSecurity(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    metadata?: Record<string, any>
  ): void {
    const level =
      severity === 'critical'
        ? LogLevel.CRITICAL
        : severity === 'high'
        ? LogLevel.ERROR
        : severity === 'medium'
        ? LogLevel.WARN
        : LogLevel.INFO;

    this.log(level, LogCategory.SECURITY, `Security Event: ${event}`, metadata);
  }

  /**
   * Performance logging
   */
  logPerformance(operation: string, duration: number, metadata?: Record<string, any>): void {
    const level = duration > 5000 ? LogLevel.WARN : duration > 1000 ? LogLevel.INFO : LogLevel.DEBUG;

    this.log(level, LogCategory.PERFORMANCE, `${operation} took ${duration}ms`, {
      operation,
      duration,
      ...metadata,
    });
  }

  /**
   * Sync logs to database (bidirectional)
   */
  private async syncToDatabase(entries: LogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    try {
      const values = entries.map((entry) => [
        entry.id,
        entry.timestamp,
        entry.level,
        entry.category,
        entry.message,
        JSON.stringify(entry.metadata || {}),
        entry.storeId,
        entry.terminalId,
        entry.userId,
        entry.sessionId,
        entry.requestId,
        entry.stackTrace,
      ]);

      await db.query(
        `INSERT INTO logging_service.application_logs
         (id, timestamp, level, category, message, metadata, store_id, terminal_id, user_id, session_id, request_id, stack_trace)
         VALUES ${values.map((_, i) => `($${i * 12 + 1}, $${i * 12 + 2}, $${i * 12 + 3}, $${i * 12 + 4}, $${i * 12 + 5}, $${i * 12 + 6}, $${i * 12 + 7}, $${i * 12 + 8}, $${i * 12 + 9}, $${i * 12 + 10}, $${i * 12 + 11}, $${i * 12 + 12})`).join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        values.flat()
      );

      // Mark as synced
      entries.forEach((entry) => {
        entry.synced = true;
        entry.syncedAt = new Date();
      });
    } catch (error) {
      console.error('Failed to sync logs to database:', error);
      // Keep in buffer for retry
    }
  }

  /**
   * Periodic sync of buffered logs
   */
  private startSyncInterval(): void {
    this.syncInterval = setInterval(async () => {
      if (this.buffer.length === 0) return;

      const toSync = this.buffer.filter((entry) => !entry.synced);
      if (toSync.length > 0) {
        await this.syncToDatabase(toSync);
      }

      // Clean up synced logs from buffer (keep last 100)
      this.buffer = this.buffer.filter((entry) => !entry.synced).slice(-100);
    }, 5000); // Sync every 5 seconds
  }

  /**
   * Fetch logs from cloud (bidirectional sync)
   */
  async fetchCloudLogs(since: Date): Promise<LogEntry[]> {
    // In production, fetch from cloud provider
    // For now, fetch from local database
    const result = await db.query(
      `SELECT * FROM logging_service.application_logs
       WHERE timestamp > $1 AND store_id != $2
       ORDER BY timestamp DESC
       LIMIT 1000`,
      [since, config.store.id]
    );

    return result.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      level: row.level,
      category: row.category,
      message: row.message,
      metadata: row.metadata,
      storeId: row.store_id,
      terminalId: row.terminal_id,
      userId: row.user_id,
      sessionId: row.session_id,
      requestId: row.request_id,
      stackTrace: row.stack_trace,
      synced: true,
      syncedAt: row.synced_at,
    }));
  }

  /**
   * Send critical alert
   */
  private async sendCriticalAlert(message: string, metadata?: Record<string, any>): Promise<void> {
    // TODO: Implement email/SMS/PagerDuty integration
    console.error('🚨 CRITICAL ALERT:', message, metadata);

    // Log to database with high priority flag
    await db.query(
      `INSERT INTO logging_service.critical_alerts
       (id, message, metadata, store_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), message, JSON.stringify(metadata), config.store.id]
    );
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Final sync of buffer
    const toSync = this.buffer.filter((entry) => !entry.synced);
    if (toSync.length > 0) {
      await this.syncToDatabase(toSync);
    }

    this.winston.close();
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Scrub sensitive data from logs (PCI/GDPR compliance)
 */
function scrubSensitiveData(data: any): any {
  if (!data) return data;

  const scrubbed = { ...data };
  const sensitiveKeys = [
    'password',
    'pin',
    'cardNumber',
    'cvv',
    'ssn',
    'driverLicense',
    'apiKey',
    'secret',
    'token',
    'authorization',
  ];

  for (const key of Object.keys(scrubbed)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      scrubbed[key] = '[REDACTED]';
    } else if (typeof scrubbed[key] === 'object') {
      scrubbed[key] = scrubSensitiveData(scrubbed[key]);
    }
  }

  return scrubbed;
}

// Export singleton instance
export const logger = ComprehensiveLogger.getInstance();
