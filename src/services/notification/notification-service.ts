import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { eventBus } from '../../shared/events';
import { EventType } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import nodemailer, { Transporter } from 'nodemailer';
import { Twilio } from 'twilio';

/**
 * Notification Service
 * Send SMS, email receipts, order ready alerts, marketing messages
 */

export enum NotificationType {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH',
}

export enum NotificationChannel {
  RECEIPT = 'RECEIPT',
  ORDER_READY = 'ORDER_READY',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  MARKETING = 'MARKETING',
  LOW_STOCK_ALERT = 'LOW_STOCK_ALERT',
  SECURITY_ALERT = 'SECURITY_ALERT',
  LOYALTY_REWARD = 'LOYALTY_REWARD',
}

export interface NotificationTemplate {
  id: string;
  channel: NotificationChannel;
  type: NotificationType;
  subject?: string; // For email
  bodyTemplate: string; // Supports {{variable}} placeholders
  isActive: boolean;
}

export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface SMSNotification {
  to: string; // Phone number in E.164 format (+1234567890)
  body: string;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class NotificationService {
  private emailTransporter: Transporter | null = null;
  private twilioClient: Twilio | null = null;
  private fromEmail: string;
  private fromPhone: string;
  private storeName: string;

  constructor() {
    this.fromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@liquorriver.com';
    this.fromPhone = process.env.TWILIO_PHONE_NUMBER || '+1234567890';
    this.storeName = process.env.STORE_NAME || 'Liquor River';

    this.initializeEmailTransporter();
    this.initializeTwilioClient();
    this.setupEventListeners();
  }

  /**
   * Initialize email transporter (SMTP)
   */
  private initializeEmailTransporter(): void {
    try {
      const smtpConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      };

      if (smtpConfig.auth.user && smtpConfig.auth.pass) {
        this.emailTransporter = nodemailer.createTransport(smtpConfig);
        log.info('Email transporter initialized', { host: smtpConfig.host });
      } else {
        log.warn('SMTP credentials not configured, email notifications disabled');
      }
    } catch (error: any) {
      log.error('Failed to initialize email transporter', { error: error.message });
    }
  }

  /**
   * Initialize Twilio client
   */
  private initializeTwilioClient(): void {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (accountSid && authToken) {
        this.twilioClient = new Twilio(accountSid, authToken);
        log.info('Twilio client initialized');
      } else {
        log.warn('Twilio credentials not configured, SMS notifications disabled');
      }
    } catch (error: any) {
      log.error('Failed to initialize Twilio client', { error: error.message });
    }
  }

  /**
   * Setup event listeners for automatic notifications
   */
  private setupEventListeners(): void {
    // Send receipt when transaction completes
    eventBus.on(EventType.TRANSACTION_COMPLETED, async (event: any) => {
      if (event.customerEmail) {
        await this.sendReceipt(event.transactionId, event.customerEmail);
      }
      if (event.customerPhone) {
        await this.sendReceiptSMS(event.transactionId, event.customerPhone);
      }
    });

    // Send order ready notification
    eventBus.on(EventType.ORDER_READY, async (event: any) => {
      if (event.customerPhone) {
        await this.sendOrderReadySMS(event.orderId, event.customerPhone, event.orderNumber);
      }
    });

    // Send low stock alert
    eventBus.on(EventType.LOW_STOCK_ALERT, async (event: any) => {
      await this.sendLowStockAlert(event.productId, event.productName, event.quantityOnHand);
    });

    // Send loyalty reward notification
    eventBus.on(EventType.LOYALTY_POINTS_AWARDED, async (event: any) => {
      if (event.memberPhone) {
        await this.sendLoyaltyPointsSMS(
          event.memberPhone,
          event.pointsEarned,
          event.pointsBalance
        );
      }
    });
  }

  /**
   * Send email
   */
  async sendEmail(notification: EmailNotification): Promise<NotificationResult> {
    if (!this.emailTransporter) {
      log.warn('Email transporter not initialized', { to: notification.to });
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const info = await this.emailTransporter.sendMail({
        from: `"${this.storeName}" <${this.fromEmail}>`,
        to: notification.to,
        subject: notification.subject,
        text: notification.body,
        html: notification.html || notification.body,
        attachments: notification.attachments,
      });

      // Log notification
      await this.logNotification(
        NotificationType.EMAIL,
        NotificationChannel.RECEIPT,
        notification.to,
        notification.subject,
        'SENT',
        info.messageId
      );

      log.info('Email sent', { to: notification.to, messageId: info.messageId });

      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      log.error('Failed to send email', {
        to: notification.to,
        error: error.message,
      });

      await this.logNotification(
        NotificationType.EMAIL,
        NotificationChannel.RECEIPT,
        notification.to,
        notification.subject,
        'FAILED',
        undefined,
        error.message
      );

      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS
   */
  async sendSMS(notification: SMSNotification): Promise<NotificationResult> {
    if (!this.twilioClient) {
      log.warn('Twilio client not initialized', { to: notification.to });
      return { success: false, error: 'SMS service not configured' };
    }

    try {
      const message = await this.twilioClient.messages.create({
        body: notification.body,
        from: this.fromPhone,
        to: notification.to,
      });

      // Log notification
      await this.logNotification(
        NotificationType.SMS,
        NotificationChannel.RECEIPT,
        notification.to,
        notification.body.substring(0, 100),
        'SENT',
        message.sid
      );

      log.info('SMS sent', { to: notification.to, messageId: message.sid });

      return { success: true, messageId: message.sid };
    } catch (error: any) {
      log.error('Failed to send SMS', {
        to: notification.to,
        error: error.message,
      });

      await this.logNotification(
        NotificationType.SMS,
        NotificationChannel.RECEIPT,
        notification.to,
        notification.body.substring(0, 100),
        'FAILED',
        undefined,
        error.message
      );

      return { success: false, error: error.message };
    }
  }

  /**
   * Send receipt email
   */
  async sendReceipt(transactionId: string, customerEmail: string): Promise<NotificationResult> {
    try {
      // Get transaction details
      const result = await db.query(
        `SELECT
          t.id, t.business_date, t.store_id, t.terminal_id,
          t.subtotal, t.tax_amount, t.total_amount, t.created_at,
          json_agg(json_build_object(
            'description', p.description,
            'quantity', li.quantity,
            'unitPrice', li.unit_price,
            'extendedPrice', li.extended_price
          )) as items
        FROM order_service.retail_transactions t
        LEFT JOIN order_service.transaction_line_items li ON t.id = li.transaction_id
        LEFT JOIN product_service.products p ON li.product_id = p.id
        WHERE t.id = $1
        GROUP BY t.id`,
        [transactionId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Transaction not found' };
      }

      const transaction = result.rows[0];

      // Generate receipt HTML
      const receiptHTML = this.generateReceiptHTML(transaction);

      return await this.sendEmail({
        to: customerEmail,
        subject: `${this.storeName} - Receipt #${transactionId.substring(0, 8)}`,
        body: this.generateReceiptText(transaction),
        html: receiptHTML,
      });
    } catch (error: any) {
      log.error('Failed to send receipt email', {
        transactionId,
        customerEmail,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send receipt SMS
   */
  async sendReceiptSMS(transactionId: string, customerPhone: string): Promise<NotificationResult> {
    try {
      const result = await db.query(
        `SELECT total_amount FROM order_service.retail_transactions WHERE id = $1`,
        [transactionId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Transaction not found' };
      }

      const total = parseFloat(result.rows[0].total_amount);

      const message = `Thank you for shopping at ${this.storeName}! Your receipt: $${total.toFixed(2)}. View online: ${process.env.WEBSITE_URL}/receipt/${transactionId}`;

      return await this.sendSMS({
        to: customerPhone,
        body: message,
      });
    } catch (error: any) {
      log.error('Failed to send receipt SMS', {
        transactionId,
        customerPhone,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send order ready SMS
   */
  async sendOrderReadySMS(
    orderId: string,
    customerPhone: string,
    orderNumber: string
  ): Promise<NotificationResult> {
    const message = `Your ${this.storeName} order #${orderNumber} is ready for pickup! Thank you for your business.`;

    return await this.sendSMS({
      to: customerPhone,
      body: message,
    });
  }

  /**
   * Send order cancelled notification
   */
  async sendOrderCancelledSMS(
    orderId: string,
    customerPhone: string,
    orderNumber: string,
    reason?: string
  ): Promise<NotificationResult> {
    const message = `Your ${this.storeName} order #${orderNumber} has been cancelled. ${reason ? `Reason: ${reason}` : ''} Please contact us if you have questions.`;

    return await this.sendSMS({
      to: customerPhone,
      body: message,
    });
  }

  /**
   * Send low stock alert (to managers)
   */
  async sendLowStockAlert(
    productId: string,
    productName: string,
    quantityOnHand: number
  ): Promise<void> {
    try {
      // Get manager emails
      const result = await db.query(
        `SELECT email FROM auth_service.users WHERE role IN ('MANAGER', 'ADMIN') AND email IS NOT NULL`
      );

      const managerEmails = result.rows.map((row) => row.email);

      if (managerEmails.length === 0) {
        log.warn('No manager emails configured for low stock alerts');
        return;
      }

      for (const email of managerEmails) {
        await this.sendEmail({
          to: email,
          subject: `Low Stock Alert - ${productName}`,
          body: `Product "${productName}" (ID: ${productId}) is low on stock.\n\nCurrent quantity: ${quantityOnHand}\n\nPlease reorder soon.`,
        });
      }

      log.info('Low stock alert sent', {
        productId,
        productName,
        quantityOnHand,
        recipients: managerEmails.length,
      });
    } catch (error: any) {
      log.error('Failed to send low stock alert', {
        productId,
        error: error.message,
      });
    }
  }

  /**
   * Send loyalty points earned SMS
   */
  async sendLoyaltyPointsSMS(
    memberPhone: string,
    pointsEarned: number,
    pointsBalance: number
  ): Promise<NotificationResult> {
    const message = `You earned ${pointsEarned} points at ${this.storeName}! Your balance: ${pointsBalance} points. Thank you for your loyalty!`;

    return await this.sendSMS({
      to: memberPhone,
      body: message,
    });
  }

  /**
   * Send marketing campaign
   */
  async sendMarketingCampaign(
    recipients: Array<{ email?: string; phone?: string; name?: string }>,
    subject: string,
    message: string,
    type: NotificationType = NotificationType.EMAIL
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        if (type === NotificationType.EMAIL && recipient.email) {
          const result = await this.sendEmail({
            to: recipient.email,
            subject,
            body: this.personalizeMessage(message, recipient.name),
          });
          if (result.success) sent++;
          else failed++;
        } else if (type === NotificationType.SMS && recipient.phone) {
          const result = await this.sendSMS({
            to: recipient.phone,
            body: this.personalizeMessage(message, recipient.name),
          });
          if (result.success) sent++;
          else failed++;
        }
      } catch (error) {
        failed++;
      }
    }

    log.info('Marketing campaign completed', { sent, failed, type });

    return { sent, failed };
  }

  /**
   * Personalize message with recipient name
   */
  private personalizeMessage(message: string, name?: string): string {
    if (!name) return message;
    return message.replace(/{{name}}/g, name).replace(/{{NAME}}/g, name);
  }

  /**
   * Generate receipt HTML
   */
  private generateReceiptHTML(transaction: any): string {
    const items = transaction.items || [];
    const itemRows = items
      .map(
        (item: any) => `
        <tr>
          <td>${item.description}</td>
          <td style="text-align: center;">${item.quantity}</td>
          <td style="text-align: right;">$${parseFloat(item.unitPrice).toFixed(2)}</td>
          <td style="text-align: right;">$${parseFloat(item.extendedPrice).toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .info { margin: 20px 0; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; }
          th { background-color: #f0f0f0; }
          .totals { text-align: right; margin-top: 20px; }
          .totals div { padding: 5px 0; }
          .total { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
          .footer { text-align: center; margin-top: 30px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${this.storeName}</h1>
          <p>Thank you for your purchase!</p>
        </div>
        <div class="info">
          <p><strong>Receipt #:</strong> ${transaction.id.substring(0, 8)}</p>
          <p><strong>Date:</strong> ${new Date(transaction.created_at).toLocaleString()}</p>
          <p><strong>Store:</strong> ${transaction.store_id}</p>
          <p><strong>Terminal:</strong> ${transaction.terminal_id}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
        <div class="totals">
          <div>Subtotal: $${parseFloat(transaction.subtotal).toFixed(2)}</div>
          <div>Tax: $${parseFloat(transaction.tax_amount).toFixed(2)}</div>
          <div class="total">Total: $${parseFloat(transaction.total_amount).toFixed(2)}</div>
        </div>
        <div class="footer">
          <p>Visit us online at ${process.env.WEBSITE_URL || 'liquorriver.com'}</p>
          <p>Questions? Contact us at ${this.fromEmail}</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate receipt text (plain text version)
   */
  private generateReceiptText(transaction: any): string {
    const items = transaction.items || [];
    const itemLines = items
      .map(
        (item: any) =>
          `${item.description} - ${item.quantity} x $${parseFloat(item.unitPrice).toFixed(2)} = $${parseFloat(item.extendedPrice).toFixed(2)}`
      )
      .join('\n');

    return `
${this.storeName}
Receipt #${transaction.id.substring(0, 8)}
Date: ${new Date(transaction.created_at).toLocaleString()}
Store: ${transaction.store_id}
Terminal: ${transaction.terminal_id}

Items:
${itemLines}

Subtotal: $${parseFloat(transaction.subtotal).toFixed(2)}
Tax: $${parseFloat(transaction.tax_amount).toFixed(2)}
Total: $${parseFloat(transaction.total_amount).toFixed(2)}

Thank you for your business!
${process.env.WEBSITE_URL || 'liquorriver.com'}
    `.trim();
  }

  /**
   * Log notification to database
   */
  private async logNotification(
    type: NotificationType,
    channel: NotificationChannel,
    recipient: string,
    content: string,
    status: 'SENT' | 'FAILED',
    messageId?: string,
    error?: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO notification_service.notifications (
          id, type, channel, recipient, content, status, message_id, error, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [uuidv4(), type, channel, recipient, content, status, messageId, error]
      );
    } catch (error: any) {
      log.error('Failed to log notification', { error: error.message });
    }
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(
    limit: number = 100,
    type?: NotificationType,
    channel?: NotificationChannel
  ): Promise<any[]> {
    try {
      let query = `
        SELECT id, type, channel, recipient, content, status, message_id, error, created_at
        FROM notification_service.notifications
        WHERE 1=1
      `;
      const params: any[] = [];

      if (type) {
        params.push(type);
        query += ` AND type = $${params.length}`;
      }

      if (channel) {
        params.push(channel);
        query += ` AND channel = $${params.length}`;
      }

      params.push(limit);
      query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

      const result = await db.query(query, params);
      return result.rows;
    } catch (error: any) {
      log.error('Failed to get notification history', { error: error.message });
      return [];
    }
  }
}

// Singleton instance
export const notificationService = new NotificationService();
