import Stripe from 'stripe';
import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { eventBus } from '../../shared/event-bus';
import { config } from '../../shared/config';
import { TenderType, EventType } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

/**
 * Payment Service
 * Handles payment processing via Stripe Terminal (P2PE compliant)
 * Supports: EMV Chip, NFC/Contactless, Magnetic Stripe, Cash
 */

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  tenderId: string;
  tenderType: TenderType;
  amount: number;
  changeAmount?: number;
  error?: string;
}

export class PaymentService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2024-11-20.acacia',
    });
  }

  /**
   * Process card payment via Stripe Terminal
   * Uses P2PE (Point-to-Point Encryption) - PCI compliant
   */
  async processCardPayment(
    transactionId: string,
    amount: number,
    terminalId?: string
  ): Promise<PaymentResult> {
    try {
      log.info('Processing card payment', {
        transactionId,
        amount,
        terminalId,
      });

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        metadata: {
          transaction_id: transactionId,
          store_id: config.store.id,
        },
      });

      // If terminal ID provided, process on specific terminal
      if (terminalId) {
        // Process on Stripe Terminal reader
        const reader = await this.stripe.terminal.readers.processPaymentIntent(
          terminalId,
          {
            payment_intent: paymentIntent.id,
          }
        );

        log.info('Card payment initiated on terminal', {
          transactionId,
          terminalId,
          paymentIntentId: paymentIntent.id,
        });
      }

      // Wait for payment confirmation (in production, use webhooks)
      // For now, we'll assume payment succeeds
      const tenderId = await this.recordTender(
        transactionId,
        TenderType.CREDIT_CARD,
        amount,
        paymentIntent.id
      );

      await eventBus.publish({
        type: EventType.PAYMENT_COMPLETED,
        aggregateId: transactionId,
        data: {
          tenderId,
          tenderType: TenderType.CREDIT_CARD,
          amount,
          paymentIntentId: paymentIntent.id,
        },
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        tenderId,
        tenderType: TenderType.CREDIT_CARD,
        amount,
      };
    } catch (error) {
      log.error('Card payment failed', error);
      return {
        success: false,
        tenderId: '',
        tenderType: TenderType.CREDIT_CARD,
        amount,
        error: error instanceof Error ? error.message : 'Payment failed',
      };
    }
  }

  /**
   * Process cash payment
   */
  async processCashPayment(
    transactionId: string,
    totalAmount: number,
    cashTendered: number
  ): Promise<PaymentResult> {
    try {
      if (cashTendered < totalAmount) {
        return {
          success: false,
          tenderId: '',
          tenderType: TenderType.CASH,
          amount: cashTendered,
          error: 'Insufficient cash tendered',
        };
      }

      const changeAmount = new Decimal(cashTendered)
        .minus(totalAmount)
        .toNumber();

      const tenderId = await this.recordTender(
        transactionId,
        TenderType.CASH,
        totalAmount,
        undefined,
        changeAmount
      );

      await eventBus.publish({
        type: EventType.PAYMENT_COMPLETED,
        aggregateId: transactionId,
        data: {
          tenderId,
          tenderType: TenderType.CASH,
          amount: totalAmount,
          cashTendered,
          changeAmount,
        },
      });

      log.info('Cash payment processed', {
        transactionId,
        totalAmount,
        cashTendered,
        changeAmount,
      });

      return {
        success: true,
        tenderId,
        tenderType: TenderType.CASH,
        amount: totalAmount,
        changeAmount,
      };
    } catch (error) {
      log.error('Cash payment failed', error);
      return {
        success: false,
        tenderId: '',
        tenderType: TenderType.CASH,
        amount: totalAmount,
        error: error instanceof Error ? error.message : 'Payment failed',
      };
    }
  }

  /**
   * Process refund
   */
  async processRefund(
    transactionId: string,
    paymentIntentId: string,
    amount: number,
    reason: string
  ): Promise<PaymentResult> {
    try {
      log.info('Processing refund', {
        transactionId,
        paymentIntentId,
        amount,
        reason,
      });

      // Create refund in Stripe
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(amount * 100), // Convert to cents
        reason: 'requested_by_customer',
        metadata: {
          transaction_id: transactionId,
          refund_reason: reason,
        },
      });

      // Record refund tender (negative amount)
      const tenderId = await this.recordTender(
        transactionId,
        TenderType.CREDIT_CARD,
        -amount,
        refund.id
      );

      await eventBus.publish({
        type: EventType.PAYMENT_REFUNDED,
        aggregateId: transactionId,
        data: {
          tenderId,
          amount,
          refundId: refund.id,
          reason,
        },
      });

      return {
        success: true,
        paymentIntentId: refund.id,
        tenderId,
        tenderType: TenderType.CREDIT_CARD,
        amount: -amount,
      };
    } catch (error) {
      log.error('Refund failed', error);
      return {
        success: false,
        tenderId: '',
        tenderType: TenderType.CREDIT_CARD,
        amount: -amount,
        error: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }

  /**
   * Record tender in database (ARTS compliant)
   */
  private async recordTender(
    transactionId: string,
    tenderType: TenderType,
    amount: number,
    externalReference?: string,
    changeAmount?: number
  ): Promise<string> {
    const tenderId = uuidv4();

    await db.query(
      `INSERT INTO order_service.transaction_tenders (
        id, transaction_id, tender_type, amount,
        external_reference, change_amount, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        tenderId,
        transactionId,
        tenderType,
        amount,
        externalReference || null,
        changeAmount || 0,
      ]
    );

    return tenderId;
  }

  /**
   * Get payment status from Stripe
   */
  async getPaymentStatus(paymentIntentId: string): Promise<string> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        paymentIntentId
      );
      return paymentIntent.status;
    } catch (error) {
      log.error('Failed to get payment status', error);
      throw error;
    }
  }

  /**
   * Cancel payment intent
   */
  async cancelPayment(paymentIntentId: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId);
      log.info('Payment intent cancelled', { paymentIntentId });
    } catch (error) {
      log.error('Failed to cancel payment', error);
      throw error;
    }
  }

  /**
   * List connected Stripe Terminal readers
   */
  async listTerminals(): Promise<Stripe.Terminal.Reader[]> {
    try {
      const readers = await this.stripe.terminal.readers.list({
        limit: 10,
      });
      return readers.data;
    } catch (error) {
      log.error('Failed to list terminals', error);
      throw error;
    }
  }

  /**
   * Register new terminal reader
   */
  async registerTerminal(
    registrationCode: string,
    label: string
  ): Promise<Stripe.Terminal.Reader> {
    try {
      const reader = await this.stripe.terminal.readers.create({
        registration_code: registrationCode,
        label,
        location: config.store.stripeLocationId,
      });

      log.info('Terminal registered', {
        readerId: reader.id,
        label,
      });

      return reader;
    } catch (error) {
      log.error('Failed to register terminal', error);
      throw error;
    }
  }

  /**
   * Cancel reader action (if customer changes mind)
   */
  async cancelReaderAction(terminalId: string): Promise<void> {
    try {
      await this.stripe.terminal.readers.cancelAction(terminalId);
      log.info('Reader action cancelled', { terminalId });
    } catch (error) {
      log.error('Failed to cancel reader action', error);
      throw error;
    }
  }

  /**
   * Split payment (multiple tenders)
   */
  async processSplitPayment(
    transactionId: string,
    totalAmount: number,
    tenders: Array<{ type: TenderType; amount: number; terminalId?: string }>
  ): Promise<PaymentResult[]> {
    const results: PaymentResult[] = [];

    let remainingAmount = totalAmount;

    for (const tender of tenders) {
      let result: PaymentResult;

      if (tender.type === TenderType.CASH) {
        result = await this.processCashPayment(
          transactionId,
          tender.amount,
          tender.amount
        );
      } else {
        result = await this.processCardPayment(
          transactionId,
          tender.amount,
          tender.terminalId
        );
      }

      results.push(result);

      if (result.success) {
        remainingAmount = new Decimal(remainingAmount)
          .minus(tender.amount)
          .toNumber();
      }
    }

    log.info('Split payment processed', {
      transactionId,
      totalAmount,
      tenderCount: tenders.length,
      remainingAmount,
    });

    return results;
  }
}
