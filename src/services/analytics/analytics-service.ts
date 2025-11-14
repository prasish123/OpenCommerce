import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { OrderChannel } from '../../shared/types';

/**
 * Analytics Service
 * Real-time dashboard, sales metrics, trending products
 */

export interface RealTimeMetrics {
  current: {
    salesToday: number;
    transactionsToday: number;
    averageTransaction: number;
    customersToday: number;
  };
  hourly: {
    currentHour: number;
    salesThisHour: number;
    transactionsThisHour: number;
  };
  comparison: {
    salesYesterday: number;
    salesLastWeek: number;
    percentChangeVsYesterday: number;
    percentChangeVsLastWeek: number;
  };
}

export interface TrendingProduct {
  productId: string;
  barcode: string;
  description: string;
  quantitySold: number;
  revenue: number;
  trendDirection: 'UP' | 'DOWN' | 'STABLE';
  percentChange: number;
}

export interface ChannelPerformance {
  channel: OrderChannel;
  transactions: number;
  revenue: number;
  averageOrderValue: number;
  percentOfTotal: number;
}

export interface SalesTimeseriesDataPoint {
  timestamp: Date;
  sales: number;
  transactions: number;
}

export class AnalyticsService {
  /**
   * Get real-time dashboard metrics
   */
  async getRealTimeMetrics(storeId?: string): Promise<RealTimeMetrics> {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const lastWeek = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split('T')[0];
    const currentHour = new Date().getHours();

    // Today's metrics
    const todayResult = await db.query(
      `SELECT
        COALESCE(SUM(total_amount), 0) as sales,
        COUNT(*) as transactions,
        COUNT(DISTINCT customer_email) as customers
      FROM order_service.retail_transactions
      WHERE business_date = $1
        AND status = 'COMPLETED'
        ${storeId ? 'AND store_id = $2' : ''}`,
      storeId ? [today, storeId] : [today]
    );

    const todayMetrics = todayResult.rows[0];
    const salesToday = parseFloat(todayMetrics.sales);
    const transactionsToday = parseInt(todayMetrics.transactions);
    const customersToday = parseInt(todayMetrics.customers || 0);

    // This hour's metrics
    const hourResult = await db.query(
      `SELECT
        COALESCE(SUM(total_amount), 0) as sales,
        COUNT(*) as transactions
      FROM order_service.retail_transactions
      WHERE business_date = $1
        AND EXTRACT(HOUR FROM created_at) = $2
        AND status = 'COMPLETED'
        ${storeId ? 'AND store_id = $3' : ''}`,
      storeId ? [today, currentHour, storeId] : [today, currentHour]
    );

    const hourMetrics = hourResult.rows[0];

    // Yesterday's metrics
    const yesterdayResult = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) as sales
      FROM order_service.retail_transactions
      WHERE business_date = $1
        AND status = 'COMPLETED'
        ${storeId ? 'AND store_id = $2' : ''}`,
      storeId ? [yesterday, storeId] : [yesterday]
    );

    const salesYesterday = parseFloat(yesterdayResult.rows[0].sales);

    // Last week's metrics (same day of week)
    const lastWeekResult = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) as sales
      FROM order_service.retail_transactions
      WHERE business_date = $1
        AND status = 'COMPLETED'
        ${storeId ? 'AND store_id = $2' : ''}`,
      storeId ? [lastWeek, storeId] : [lastWeek]
    );

    const salesLastWeek = parseFloat(lastWeekResult.rows[0].sales);

    // Calculate percent changes
    const percentChangeVsYesterday =
      salesYesterday > 0
        ? ((salesToday - salesYesterday) / salesYesterday) * 100
        : 0;

    const percentChangeVsLastWeek =
      salesLastWeek > 0
        ? ((salesToday - salesLastWeek) / salesLastWeek) * 100
        : 0;

    return {
      current: {
        salesToday,
        transactionsToday,
        averageTransaction:
          transactionsToday > 0 ? salesToday / transactionsToday : 0,
        customersToday,
      },
      hourly: {
        currentHour,
        salesThisHour: parseFloat(hourMetrics.sales),
        transactionsThisHour: parseInt(hourMetrics.transactions),
      },
      comparison: {
        salesYesterday,
        salesLastWeek,
        percentChangeVsYesterday,
        percentChangeVsLastWeek,
      },
    };
  }

  /**
   * Get trending products (last 7 days vs previous 7 days)
   */
  async getTrendingProducts(
    limit: number = 20,
    storeId?: string
  ): Promise<TrendingProduct[]> {
    const today = new Date();
    const last7Days = new Date(today.getTime() - 7 * 86400000)
      .toISOString()
      .split('T')[0];
    const prev7Days = new Date(today.getTime() - 14 * 86400000)
      .toISOString()
      .split('T')[0];

    // Current week sales
    const currentWeekResult = await db.query(
      `SELECT
        li.product_id,
        p.barcode,
        p.description,
        SUM(li.quantity) as quantity_sold,
        SUM(li.extended_price) as revenue
      FROM order_service.transaction_line_items li
      JOIN product_service.products p ON li.product_id = p.id
      JOIN order_service.retail_transactions t ON li.transaction_id = t.id
      WHERE t.business_date >= $1
        AND t.status = 'COMPLETED'
        ${storeId ? 'AND t.store_id = $2' : ''}
      GROUP BY li.product_id, p.barcode, p.description
      ORDER BY revenue DESC
      LIMIT $${storeId ? '3' : '2'}`,
      storeId ? [last7Days, storeId, limit] : [last7Days, limit]
    );

    // Previous week sales
    const prevWeekResult = await db.query(
      `SELECT
        li.product_id,
        SUM(li.quantity) as quantity_sold,
        SUM(li.extended_price) as revenue
      FROM order_service.transaction_line_items li
      JOIN order_service.retail_transactions t ON li.transaction_id = t.id
      WHERE t.business_date >= $1 AND t.business_date < $2
        AND t.status = 'COMPLETED'
        ${storeId ? 'AND t.store_id = $3' : ''}
      GROUP BY li.product_id`,
      storeId ? [prev7Days, last7Days, storeId] : [prev7Days, last7Days]
    );

    // Create map of previous week sales
    const prevWeekMap = new Map();
    for (const row of prevWeekResult.rows) {
      prevWeekMap.set(row.product_id, parseFloat(row.revenue));
    }

    // Calculate trends
    const trending: TrendingProduct[] = [];

    for (const row of currentWeekResult.rows) {
      const currentRevenue = parseFloat(row.revenue);
      const prevRevenue = prevWeekMap.get(row.product_id) || 0;

      let percentChange = 0;
      let trendDirection: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';

      if (prevRevenue > 0) {
        percentChange = ((currentRevenue - prevRevenue) / prevRevenue) * 100;
        if (percentChange > 10) {
          trendDirection = 'UP';
        } else if (percentChange < -10) {
          trendDirection = 'DOWN';
        }
      } else if (currentRevenue > 0) {
        trendDirection = 'UP';
        percentChange = 100;
      }

      trending.push({
        productId: row.product_id,
        barcode: row.barcode,
        description: row.description,
        quantitySold: parseFloat(row.quantity_sold),
        revenue: currentRevenue,
        trendDirection,
        percentChange,
      });
    }

    return trending;
  }

  /**
   * Get channel performance
   */
  async getChannelPerformance(
    startDate?: string,
    endDate?: string,
    storeId?: string
  ): Promise<ChannelPerformance[]> {
    const start = startDate || new Date().toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const result = await db.query(
      `SELECT
        channel,
        COUNT(*) as transactions,
        SUM(total_amount) as revenue
      FROM order_service.retail_transactions
      WHERE business_date >= $1 AND business_date <= $2
        AND status = 'COMPLETED'
        ${storeId ? 'AND store_id = $3' : ''}
      GROUP BY channel
      ORDER BY revenue DESC`,
      storeId ? [start, end, storeId] : [start, end]
    );

    // Calculate total revenue for percentage
    const totalRevenue = result.rows.reduce(
      (sum, row) => sum + parseFloat(row.revenue),
      0
    );

    return result.rows.map((row) => {
      const revenue = parseFloat(row.revenue);
      const transactions = parseInt(row.transactions);

      return {
        channel: row.channel,
        transactions,
        revenue,
        averageOrderValue: transactions > 0 ? revenue / transactions : 0,
        percentOfTotal: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      };
    });
  }

  /**
   * Get sales timeseries (for charts)
   */
  async getSalesTimeseries(
    startDate: string,
    endDate: string,
    interval: 'hour' | 'day' = 'hour',
    storeId?: string
  ): Promise<SalesTimeseriesDataPoint[]> {
    const query =
      interval === 'hour'
        ? `SELECT
            DATE_TRUNC('hour', created_at) as timestamp,
            SUM(total_amount) as sales,
            COUNT(*) as transactions
          FROM order_service.retail_transactions
          WHERE business_date >= $1 AND business_date <= $2
            AND status = 'COMPLETED'
            ${storeId ? 'AND store_id = $3' : ''}
          GROUP BY DATE_TRUNC('hour', created_at)
          ORDER BY timestamp`
        : `SELECT
            business_date as timestamp,
            SUM(total_amount) as sales,
            COUNT(*) as transactions
          FROM order_service.retail_transactions
          WHERE business_date >= $1 AND business_date <= $2
            AND status = 'COMPLETED'
            ${storeId ? 'AND store_id = $3' : ''}
          GROUP BY business_date
          ORDER BY business_date`;

    const result = await db.query(
      query,
      storeId ? [startDate, endDate, storeId] : [startDate, endDate]
    );

    return result.rows.map((row) => ({
      timestamp: new Date(row.timestamp),
      sales: parseFloat(row.sales),
      transactions: parseInt(row.transactions),
    }));
  }

  /**
   * Get customer analytics
   */
  async getCustomerAnalytics(storeId?: string): Promise<any> {
    const today = new Date().toISOString().split('T')[0];

    // New vs returning customers
    const customerResult = await db.query(
      `SELECT
        COUNT(DISTINCT customer_email) FILTER (WHERE is_first_purchase) as new_customers,
        COUNT(DISTINCT customer_email) FILTER (WHERE NOT is_first_purchase) as returning_customers
      FROM (
        SELECT
          customer_email,
          COUNT(*) OVER (PARTITION BY customer_email ORDER BY created_at) = 1 as is_first_purchase
        FROM order_service.retail_transactions
        WHERE business_date = $1
          AND customer_email IS NOT NULL
          AND status = 'COMPLETED'
          ${storeId ? 'AND store_id = $2' : ''}
      ) sub`,
      storeId ? [today, storeId] : [today]
    );

    // Average order value
    const aovResult = await db.query(
      `SELECT AVG(total_amount) as avg_order_value
      FROM order_service.retail_transactions
      WHERE business_date = $1
        AND status = 'COMPLETED'
        ${storeId ? 'AND store_id = $2' : ''}`,
      storeId ? [today, storeId] : [today]
    );

    return {
      newCustomers: parseInt(customerResult.rows[0]?.new_customers || 0),
      returningCustomers: parseInt(
        customerResult.rows[0]?.returning_customers || 0
      ),
      averageOrderValue: parseFloat(
        aovResult.rows[0]?.avg_order_value || 0
      ),
    };
  }

  /**
   * Get inventory analytics
   */
  async getInventoryAnalytics(storeId: string): Promise<any> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_products,
        SUM(quantity_on_hand) as total_units,
        COUNT(*) FILTER (WHERE quantity_on_hand <= reorder_point) as low_stock_count,
        COUNT(*) FILTER (WHERE quantity_on_hand = 0) as out_of_stock_count
      FROM inventory_service.inventory
      WHERE store_id = $1`,
      [storeId]
    );

    return {
      totalProducts: parseInt(result.rows[0]?.total_products || 0),
      totalUnits: parseFloat(result.rows[0]?.total_units || 0),
      lowStockCount: parseInt(result.rows[0]?.low_stock_count || 0),
      outOfStockCount: parseInt(result.rows[0]?.out_of_stock_count || 0),
    };
  }

  /**
   * Get peak hours analysis
   */
  async getPeakHours(storeId?: string): Promise<Array<{ hour: number; sales: number; transactions: number }>> {
    const result = await db.query(
      `SELECT
        EXTRACT(HOUR FROM created_at) as hour,
        SUM(total_amount) as sales,
        COUNT(*) as transactions
      FROM order_service.retail_transactions
      WHERE business_date >= CURRENT_DATE - INTERVAL '30 days'
        AND status = 'COMPLETED'
        ${storeId ? 'AND store_id = $1' : ''}
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY sales DESC`,
      storeId ? [storeId] : []
    );

    return result.rows.map((row) => ({
      hour: parseInt(row.hour),
      sales: parseFloat(row.sales),
      transactions: parseInt(row.transactions),
    }));
  }

  /**
   * Get conversion funnel (for online channels)
   */
  async getConversionFunnel(channel: OrderChannel): Promise<any> {
    const today = new Date().toISOString().split('T')[0];

    const result = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'NEW') as received,
        COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'COMPLETED')) as accepted,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled
      FROM order_service.retail_transactions
      WHERE business_date = $1 AND channel = $2`,
      [today, channel]
    );

    const row = result.rows[0];
    const received = parseInt(row.received);
    const accepted = parseInt(row.accepted);
    const completed = parseInt(row.completed);
    const cancelled = parseInt(row.cancelled);

    return {
      received,
      accepted,
      completed,
      cancelled,
      acceptanceRate: received > 0 ? (accepted / received) * 100 : 0,
      completionRate: accepted > 0 ? (completed / accepted) * 100 : 0,
      cancellationRate: received > 0 ? (cancelled / received) * 100 : 0,
    };
  }
}

// Singleton instance
export const analyticsService = new AnalyticsService();
