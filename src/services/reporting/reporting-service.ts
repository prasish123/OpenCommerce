import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { TenderType } from '../../shared/types';
import Decimal from 'decimal.js';

/**
 * Reporting Service
 * Generates X/Z reports, EOD summaries, sales reports, drawer reconciliation
 */

export interface XReport {
  reportType: 'X_REPORT';
  storeId: string;
  terminalId: string;
  businessDate: string;
  generatedAt: Date;
  generatedBy: string;

  summary: {
    totalSales: number;
    totalTax: number;
    totalTransactions: number;
    totalItems: number;
    averageTransaction: number;
  };

  tenders: {
    cash: { count: number; amount: number };
    creditCard: { count: number; amount: number };
    debitCard: { count: number; amount: number };
    other: { count: number; amount: number };
  };

  discounts: {
    totalDiscounts: number;
    discountCount: number;
  };

  voids: {
    totalVoided: number;
    voidCount: number;
  };

  refunds: {
    totalRefunded: number;
    refundCount: number;
  };

  hourlyBreakdown: Array<{
    hour: number;
    transactions: number;
    sales: number;
  }>;
}

export interface ZReport extends XReport {
  reportType: 'Z_REPORT';
  drawerStartingCash: number;
  drawerExpectedCash: number;
  drawerActualCash?: number;
  drawerVariance?: number;
}

export interface EODReport {
  businessDate: string;
  storeId: string;
  generatedAt: Date;

  dailySummary: {
    totalSales: number;
    totalTax: number;
    totalTransactions: number;
    totalCustomers: number;
  };

  channelBreakdown: {
    inStore: { transactions: number; sales: number };
    doorDash: { transactions: number; sales: number };
    uberEats: { transactions: number; sales: number };
    website: { transactions: number; sales: number };
  };

  topProducts: Array<{
    productId: string;
    barcode: string;
    description: string;
    quantitySold: number;
    revenue: number;
  }>;

  hourlyTrend: Array<{
    hour: number;
    transactions: number;
    sales: number;
  }>;
}

export interface DrawerReconciliation {
  terminalId: string;
  businessDate: string;
  openedAt: Date;
  openedBy: string;
  closedAt?: Date;
  closedBy?: string;

  startingCash: number;

  expected: {
    cash: number;
    totalSales: number;
  };

  actual?: {
    cash: number;
  };

  variance?: number;
  status: 'OPEN' | 'RECONCILED' | 'VARIANCE';
}

export class ReportingService {
  /**
   * Generate X Report (mid-day report, does not close drawer)
   */
  async generateXReport(
    storeId: string,
    terminalId: string,
    userId: string
  ): Promise<XReport> {
    const businessDate = this.getCurrentBusinessDate();

    log.info('Generating X Report', { storeId, terminalId, businessDate });

    // Get transactions for today
    const transactions = await this.getTransactionsForDate(storeId, businessDate, terminalId);

    // Calculate summary
    const summary = this.calculateSummary(transactions);

    // Calculate tender breakdown
    const tenders = await this.calculateTenderBreakdown(storeId, businessDate, terminalId);

    // Calculate discounts
    const discounts = await this.calculateDiscounts(storeId, businessDate, terminalId);

    // Calculate voids
    const voids = await this.calculateVoids(storeId, businessDate, terminalId);

    // Calculate refunds
    const refunds = await this.calculateRefunds(storeId, businessDate, terminalId);

    // Get hourly breakdown
    const hourlyBreakdown = await this.getHourlyBreakdown(storeId, businessDate, terminalId);

    const report: XReport = {
      reportType: 'X_REPORT',
      storeId,
      terminalId,
      businessDate,
      generatedAt: new Date(),
      generatedBy: userId,
      summary,
      tenders,
      discounts,
      voids,
      refunds,
      hourlyBreakdown,
    };

    // Save report
    await this.saveReport('X_REPORT', report);

    log.info('X Report generated', { storeId, terminalId, totalSales: summary.totalSales });

    return report;
  }

  /**
   * Generate Z Report (end of day, closes drawer)
   */
  async generateZReport(
    storeId: string,
    terminalId: string,
    userId: string,
    actualCashInDrawer?: number
  ): Promise<ZReport> {
    const businessDate = this.getCurrentBusinessDate();

    log.info('Generating Z Report', { storeId, terminalId, businessDate });

    // Generate X Report data first
    const xReport = await this.generateXReport(storeId, terminalId, userId);

    // Get drawer information
    const drawerInfo = await this.getDrawerInfo(terminalId, businessDate);

    // Calculate variance if actual cash provided
    let drawerVariance = undefined;
    if (actualCashInDrawer !== undefined) {
      drawerVariance = new Decimal(actualCashInDrawer)
        .minus(drawerInfo.expectedCash)
        .toNumber();
    }

    const zReport: ZReport = {
      ...xReport,
      reportType: 'Z_REPORT',
      drawerStartingCash: drawerInfo.startingCash,
      drawerExpectedCash: drawerInfo.expectedCash,
      drawerActualCash: actualCashInDrawer,
      drawerVariance,
    };

    // Save report
    await this.saveReport('Z_REPORT', zReport);

    // Close drawer
    if (actualCashInDrawer !== undefined) {
      await this.closeDrawer(terminalId, businessDate, userId, actualCashInDrawer);
    }

    log.info('Z Report generated', {
      storeId,
      terminalId,
      totalSales: zReport.summary.totalSales,
      drawerVariance,
    });

    return zReport;
  }

  /**
   * Generate End of Day report
   */
  async generateEODReport(storeId: string): Promise<EODReport> {
    const businessDate = this.getCurrentBusinessDate();

    log.info('Generating EOD Report', { storeId, businessDate });

    // Daily summary
    const dailySummary = await this.getDailySummary(storeId, businessDate);

    // Channel breakdown
    const channelBreakdown = await this.getChannelBreakdown(storeId, businessDate);

    // Top products
    const topProducts = await this.getTopProducts(storeId, businessDate, 20);

    // Hourly trend
    const hourlyTrend = await this.getHourlyBreakdown(storeId, businessDate);

    const report: EODReport = {
      businessDate,
      storeId,
      generatedAt: new Date(),
      dailySummary,
      channelBreakdown,
      topProducts,
      hourlyTrend,
    };

    // Save report
    await this.saveReport('EOD_REPORT', report);

    log.info('EOD Report generated', { storeId, totalSales: dailySummary.totalSales });

    return report;
  }

  /**
   * Open drawer for day
   */
  async openDrawer(
    terminalId: string,
    userId: string,
    startingCash: number
  ): Promise<DrawerReconciliation> {
    const businessDate = this.getCurrentBusinessDate();

    await db.query(
      `INSERT INTO reporting_service.drawer_sessions (
        id, terminal_id, business_date, opened_at, opened_by,
        starting_cash, status
      ) VALUES (gen_random_uuid(), $1, $2, NOW(), $3, $4, 'OPEN')`,
      [terminalId, businessDate, userId, startingCash]
    );

    log.info('Drawer opened', { terminalId, businessDate, startingCash, userId });

    return {
      terminalId,
      businessDate,
      openedAt: new Date(),
      openedBy: userId,
      startingCash,
      expected: {
        cash: startingCash,
        totalSales: 0,
      },
      status: 'OPEN',
    };
  }

  /**
   * Close drawer (EOD reconciliation)
   */
  private async closeDrawer(
    terminalId: string,
    businessDate: string,
    userId: string,
    actualCash: number
  ): Promise<void> {
    const drawerInfo = await this.getDrawerInfo(terminalId, businessDate);
    const variance = new Decimal(actualCash).minus(drawerInfo.expectedCash).toNumber();

    const status = Math.abs(variance) > 0.01 ? 'VARIANCE' : 'RECONCILED';

    await db.query(
      `UPDATE reporting_service.drawer_sessions
       SET closed_at = NOW(),
           closed_by = $1,
           actual_cash = $2,
           variance = $3,
           status = $4
       WHERE terminal_id = $5 AND business_date = $6`,
      [userId, actualCash, variance, status, terminalId, businessDate]
    );

    log.info('Drawer closed', {
      terminalId,
      businessDate,
      actualCash,
      expectedCash: drawerInfo.expectedCash,
      variance,
      status,
    });
  }

  /**
   * Get drawer information
   */
  private async getDrawerInfo(
    terminalId: string,
    businessDate: string
  ): Promise<{ startingCash: number; expectedCash: number }> {
    // Get drawer session
    const sessionResult = await db.query(
      `SELECT starting_cash
       FROM reporting_service.drawer_sessions
       WHERE terminal_id = $1 AND business_date = $2`,
      [terminalId, businessDate]
    );

    const startingCash = sessionResult.rows[0]?.starting_cash || 0;

    // Get cash sales
    const salesResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as cash_sales
       FROM order_service.transaction_tenders
       WHERE tender_type = 'CASH'
         AND transaction_id IN (
           SELECT id FROM order_service.retail_transactions
           WHERE business_date = $1
             AND (terminal_id = $2 OR terminal_id IS NULL)
         )`,
      [businessDate, terminalId]
    );

    const cashSales = parseFloat(salesResult.rows[0]?.cash_sales || 0);

    // Get cash refunds (negative)
    const refundResult = await db.query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as cash_refunds
       FROM order_service.transaction_tenders
       WHERE tender_type = 'CASH' AND amount < 0
         AND transaction_id IN (
           SELECT id FROM order_service.retail_transactions
           WHERE business_date = $1
             AND (terminal_id = $2 OR terminal_id IS NULL)
         )`,
      [businessDate, terminalId]
    );

    const cashRefunds = parseFloat(refundResult.rows[0]?.cash_refunds || 0);

    const expectedCash = new Decimal(startingCash)
      .plus(cashSales)
      .minus(cashRefunds)
      .toNumber();

    return { startingCash, expectedCash };
  }

  /**
   * Get transactions for date
   */
  private async getTransactionsForDate(
    storeId: string,
    businessDate: string,
    terminalId?: string
  ) {
    const query = terminalId
      ? `SELECT * FROM order_service.retail_transactions
         WHERE business_date = $1 AND (terminal_id = $2 OR terminal_id IS NULL) AND status = 'COMPLETED'`
      : `SELECT * FROM order_service.retail_transactions
         WHERE business_date = $1 AND status = 'COMPLETED'`;

    const params = terminalId ? [businessDate, terminalId] : [businessDate];
    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(transactions: any[]) {
    let totalSales = 0;
    let totalTax = 0;
    let totalItems = 0;

    for (const txn of transactions) {
      totalSales += parseFloat(txn.total_amount || 0);
      totalTax += parseFloat(txn.tax_amount || 0);
    }

    const totalTransactions = transactions.length;
    const averageTransaction =
      totalTransactions > 0 ? totalSales / totalTransactions : 0;

    return {
      totalSales,
      totalTax,
      totalTransactions,
      totalItems,
      averageTransaction,
    };
  }

  /**
   * Calculate tender breakdown
   */
  private async calculateTenderBreakdown(
    storeId: string,
    businessDate: string,
    terminalId?: string
  ) {
    const query = `
      SELECT tender_type, COUNT(*) as count, SUM(amount) as total
      FROM order_service.transaction_tenders
      WHERE transaction_id IN (
        SELECT id FROM order_service.retail_transactions
        WHERE business_date = $1
          ${terminalId ? 'AND (terminal_id = $2 OR terminal_id IS NULL)' : ''}
      )
      GROUP BY tender_type
    `;

    const params = terminalId ? [businessDate, terminalId] : [businessDate];
    const result = await db.query(query, params);

    const tenders = {
      cash: { count: 0, amount: 0 },
      creditCard: { count: 0, amount: 0 },
      debitCard: { count: 0, amount: 0 },
      other: { count: 0, amount: 0 },
    };

    for (const row of result.rows) {
      const count = parseInt(row.count);
      const amount = parseFloat(row.total);

      switch (row.tender_type) {
        case TenderType.CASH:
          tenders.cash = { count, amount };
          break;
        case TenderType.CREDIT_CARD:
          tenders.creditCard = { count, amount };
          break;
        case TenderType.DEBIT_CARD:
          tenders.debitCard = { count, amount };
          break;
        default:
          tenders.other.count += count;
          tenders.other.amount += amount;
      }
    }

    return tenders;
  }

  /**
   * Calculate discounts
   */
  private async calculateDiscounts(
    storeId: string,
    businessDate: string,
    terminalId?: string
  ) {
    // TODO: Implement discount calculation from promotions
    return {
      totalDiscounts: 0,
      discountCount: 0,
    };
  }

  /**
   * Calculate voids
   */
  private async calculateVoids(
    storeId: string,
    businessDate: string,
    terminalId?: string
  ) {
    const query = `
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM order_service.retail_transactions
      WHERE business_date = $1
        ${terminalId ? 'AND (terminal_id = $2 OR terminal_id IS NULL)' : ''}
        AND status = 'CANCELLED'
    `;

    const params = terminalId ? [businessDate, terminalId] : [businessDate];
    const result = await db.query(query, params);

    return {
      totalVoided: parseFloat(result.rows[0]?.total || 0),
      voidCount: parseInt(result.rows[0]?.count || 0),
    };
  }

  /**
   * Calculate refunds
   */
  private async calculateRefunds(
    storeId: string,
    businessDate: string,
    terminalId?: string
  ) {
    const query = `
      SELECT COUNT(*) as count, COALESCE(SUM(ABS(amount)), 0) as total
      FROM order_service.transaction_tenders
      WHERE amount < 0
        AND transaction_id IN (
          SELECT id FROM order_service.retail_transactions
          WHERE business_date = $1
            ${terminalId ? 'AND (terminal_id = $2 OR terminal_id IS NULL)' : ''}
        )
    `;

    const params = terminalId ? [businessDate, terminalId] : [businessDate];
    const result = await db.query(query, params);

    return {
      totalRefunded: parseFloat(result.rows[0]?.total || 0),
      refundCount: parseInt(result.rows[0]?.count || 0),
    };
  }

  /**
   * Get hourly breakdown
   */
  private async getHourlyBreakdown(
    storeId: string,
    businessDate: string,
    terminalId?: string
  ): Promise<Array<{ hour: number; transactions: number; sales: number }>> {
    const query = `
      SELECT
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as sales
      FROM order_service.retail_transactions
      WHERE business_date = $1
        ${terminalId ? 'AND (terminal_id = $2 OR terminal_id IS NULL)' : ''}
        AND status = 'COMPLETED'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `;

    const params = terminalId ? [businessDate, terminalId] : [businessDate];
    const result = await db.query(query, params);

    return result.rows.map((row) => ({
      hour: parseInt(row.hour),
      transactions: parseInt(row.transactions),
      sales: parseFloat(row.sales),
    }));
  }

  /**
   * Get daily summary
   */
  private async getDailySummary(storeId: string, businessDate: string) {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(tax_amount), 0) as total_tax,
        COUNT(DISTINCT customer_email) as total_customers
       FROM order_service.retail_transactions
       WHERE business_date = $1 AND status = 'COMPLETED'`,
      [businessDate]
    );

    return {
      totalSales: parseFloat(result.rows[0]?.total_sales || 0),
      totalTax: parseFloat(result.rows[0]?.total_tax || 0),
      totalTransactions: parseInt(result.rows[0]?.total_transactions || 0),
      totalCustomers: parseInt(result.rows[0]?.total_customers || 0),
    };
  }

  /**
   * Get channel breakdown
   */
  private async getChannelBreakdown(storeId: string, businessDate: string) {
    const result = await db.query(
      `SELECT
        channel,
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as sales
       FROM order_service.retail_transactions
       WHERE business_date = $1 AND status = 'COMPLETED'
       GROUP BY channel`,
      [businessDate]
    );

    const breakdown = {
      inStore: { transactions: 0, sales: 0 },
      doorDash: { transactions: 0, sales: 0 },
      uberEats: { transactions: 0, sales: 0 },
      website: { transactions: 0, sales: 0 },
    };

    for (const row of result.rows) {
      const transactions = parseInt(row.transactions);
      const sales = parseFloat(row.sales);

      switch (row.channel) {
        case 'IN_STORE':
          breakdown.inStore = { transactions, sales };
          break;
        case 'DOORDASH':
          breakdown.doorDash = { transactions, sales };
          break;
        case 'UBER_EATS':
          breakdown.uberEats = { transactions, sales };
          break;
        case 'WEBSITE':
          breakdown.website = { transactions, sales };
          break;
      }
    }

    return breakdown;
  }

  /**
   * Get top selling products
   */
  private async getTopProducts(storeId: string, businessDate: string, limit: number) {
    const result = await db.query(
      `SELECT
        li.product_id as "productId",
        p.barcode,
        p.description,
        SUM(li.quantity) as "quantitySold",
        SUM(li.extended_price) as revenue
       FROM order_service.transaction_line_items li
       JOIN product_service.products p ON li.product_id = p.id
       WHERE li.transaction_id IN (
         SELECT id FROM order_service.retail_transactions
         WHERE business_date = $1 AND status = 'COMPLETED'
       )
       GROUP BY li.product_id, p.barcode, p.description
       ORDER BY revenue DESC
       LIMIT $2`,
      [businessDate, limit]
    );

    return result.rows.map((row) => ({
      productId: row.productId,
      barcode: row.barcode,
      description: row.description,
      quantitySold: parseFloat(row.quantitySold),
      revenue: parseFloat(row.revenue),
    }));
  }

  /**
   * Save report to database
   */
  private async saveReport(reportType: string, report: any): Promise<void> {
    await db.query(
      `INSERT INTO reporting_service.reports (
        id, report_type, business_date, store_id, terminal_id,
        report_data, generated_at, generated_by
      ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
      [
        reportType,
        report.businessDate,
        report.storeId,
        report.terminalId || null,
        JSON.stringify(report),
        report.generatedAt,
        report.generatedBy || null,
      ]
    );
  }

  /**
   * Get current business date
   */
  private getCurrentBusinessDate(): string {
    // Business day starts at 4 AM
    const now = new Date();
    const cutoffHour = 4;

    if (now.getHours() < cutoffHour) {
      // Before 4 AM, use yesterday's date
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }

    return now.toISOString().split('T')[0];
  }
}

// Singleton instance
export const reportingService = new ReportingService();
