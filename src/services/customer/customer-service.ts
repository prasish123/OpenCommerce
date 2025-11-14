import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Customer Service
 * Customer profiles, purchase history, preferences
 */

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfBirth?: Date;
  preferences?: CustomerPreferences;
  tags?: string[];
  notes?: string;
  createdAt: Date;
  lastPurchase?: Date;
}

export interface CustomerPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  favoriteProducts?: string[];
  preferredChannel?: string;
}

export interface CustomerStats {
  totalPurchases: number;
  totalSpent: number;
  averageOrderValue: number;
  lifetimeValue: number;
  lastPurchaseDate?: Date;
  firstPurchaseDate?: Date;
  daysSinceLastPurchase?: number;
}

export interface PurchaseHistory {
  orderId: string;
  orderDate: Date;
  channel: string;
  totalAmount: number;
  itemCount: number;
  status: string;
}

export class CustomerService {
  /**
   * Create new customer
   */
  async createCustomer(
    firstName: string,
    lastName: string,
    email?: string,
    phone?: string,
    address?: string,
    city?: string,
    state?: string,
    zipCode?: string
  ): Promise<Customer> {
    const customerId = uuidv4();
    const cleanPhone = phone?.replace(/\D/g, '');

    await db.query(
      `INSERT INTO customer_service.customers (
        id, first_name, last_name, email, phone,
        address, city, state, zip_code, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        customerId,
        firstName,
        lastName,
        email || null,
        cleanPhone || null,
        address || null,
        city || null,
        state || null,
        zipCode || null,
      ]
    );

    log.info('Customer created', { customerId, email, phone: cleanPhone });

    return {
      id: customerId,
      firstName,
      lastName,
      email,
      phone: cleanPhone,
      address,
      city,
      state,
      zipCode,
      createdAt: new Date(),
    };
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<Customer | null> {
    const result = await db.query(
      `SELECT
        id, first_name as "firstName", last_name as "lastName",
        email, phone, address, city, state, zip_code as "zipCode",
        date_of_birth as "dateOfBirth", preferences, tags, notes,
        created_at as "createdAt", last_purchase as "lastPurchase"
      FROM customer_service.customers
      WHERE id = $1`,
      [customerId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Search customers by email or phone
   */
  async searchCustomers(query: string): Promise<Customer[]> {
    const cleanPhone = query.replace(/\D/g, '');

    const result = await db.query(
      `SELECT
        id, first_name as "firstName", last_name as "lastName",
        email, phone, address, city, state, zip_code as "zipCode",
        created_at as "createdAt", last_purchase as "lastPurchase"
      FROM customer_service.customers
      WHERE email ILIKE $1
         OR phone = $2
         OR CONCAT(first_name, ' ', last_name) ILIKE $1
      ORDER BY last_purchase DESC NULLS LAST
      LIMIT 20`,
      [`%${query}%`, cleanPhone]
    );

    return result.rows;
  }

  /**
   * Update customer
   */
  async updateCustomer(
    customerId: string,
    updates: Partial<Customer>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (updates.firstName) {
      fields.push(`first_name = $${index++}`);
      values.push(updates.firstName);
    }
    if (updates.lastName) {
      fields.push(`last_name = $${index++}`);
      values.push(updates.lastName);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${index++}`);
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      const cleanPhone = updates.phone?.replace(/\D/g, '');
      fields.push(`phone = $${index++}`);
      values.push(cleanPhone);
    }
    if (updates.address !== undefined) {
      fields.push(`address = $${index++}`);
      values.push(updates.address);
    }
    if (updates.city !== undefined) {
      fields.push(`city = $${index++}`);
      values.push(updates.city);
    }
    if (updates.state !== undefined) {
      fields.push(`state = $${index++}`);
      values.push(updates.state);
    }
    if (updates.zipCode !== undefined) {
      fields.push(`zip_code = $${index++}`);
      values.push(updates.zipCode);
    }
    if (updates.dateOfBirth !== undefined) {
      fields.push(`date_of_birth = $${index++}`);
      values.push(updates.dateOfBirth);
    }
    if (updates.preferences !== undefined) {
      fields.push(`preferences = $${index++}`);
      values.push(JSON.stringify(updates.preferences));
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${index++}`);
      values.push(updates.notes);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(customerId);

    await db.query(
      `UPDATE customer_service.customers
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${index}`,
      values
    );

    log.info('Customer updated', { customerId });
  }

  /**
   * Get customer statistics
   */
  async getCustomerStats(customerId: string): Promise<CustomerStats> {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_purchases,
        COALESCE(SUM(total_amount), 0) as total_spent,
        COALESCE(AVG(total_amount), 0) as avg_order_value,
        MIN(created_at) as first_purchase,
        MAX(created_at) as last_purchase
      FROM order_service.retail_transactions
      WHERE customer_id = $1 AND status = 'COMPLETED'`,
      [customerId]
    );

    const row = result.rows[0];
    const lastPurchaseDate = row.last_purchase ? new Date(row.last_purchase) : undefined;
    const daysSinceLastPurchase = lastPurchaseDate
      ? Math.floor((Date.now() - lastPurchaseDate.getTime()) / 86400000)
      : undefined;

    return {
      totalPurchases: parseInt(row.total_purchases),
      totalSpent: parseFloat(row.total_spent),
      averageOrderValue: parseFloat(row.avg_order_value),
      lifetimeValue: parseFloat(row.total_spent), // Could add more complex LTV calculation
      lastPurchaseDate,
      firstPurchaseDate: row.first_purchase ? new Date(row.first_purchase) : undefined,
      daysSinceLastPurchase,
    };
  }

  /**
   * Get purchase history
   */
  async getPurchaseHistory(
    customerId: string,
    limit: number = 50
  ): Promise<PurchaseHistory[]> {
    const result = await db.query(
      `SELECT
        t.id as "orderId",
        t.created_at as "orderDate",
        t.channel,
        t.total_amount as "totalAmount",
        t.status,
        COUNT(li.id) as "itemCount"
      FROM order_service.retail_transactions t
      LEFT JOIN order_service.transaction_line_items li ON t.id = li.transaction_id
      WHERE t.customer_id = $1
      GROUP BY t.id, t.created_at, t.channel, t.total_amount, t.status
      ORDER BY t.created_at DESC
      LIMIT $2`,
      [customerId, limit]
    );

    return result.rows.map((row) => ({
      orderId: row.orderId,
      orderDate: new Date(row.orderDate),
      channel: row.channel,
      totalAmount: parseFloat(row.totalAmount),
      itemCount: parseInt(row.itemCount),
      status: row.status,
    }));
  }

  /**
   * Get favorite products (most purchased)
   */
  async getFavoriteProducts(customerId: string, limit: number = 10): Promise<any[]> {
    const result = await db.query(
      `SELECT
        p.id,
        p.barcode,
        p.description,
        SUM(li.quantity) as total_quantity,
        COUNT(DISTINCT t.id) as purchase_count
      FROM order_service.transaction_line_items li
      JOIN order_service.retail_transactions t ON li.transaction_id = t.id
      JOIN product_service.products p ON li.product_id = p.id
      WHERE t.customer_id = $1 AND t.status = 'COMPLETED'
      GROUP BY p.id, p.barcode, p.description
      ORDER BY purchase_count DESC, total_quantity DESC
      LIMIT $2`,
      [customerId, limit]
    );

    return result.rows.map((row) => ({
      productId: row.id,
      barcode: row.barcode,
      description: row.description,
      totalQuantity: parseFloat(row.total_quantity),
      purchaseCount: parseInt(row.purchase_count),
    }));
  }

  /**
   * Add tag to customer
   */
  async addTag(customerId: string, tag: string): Promise<void> {
    await db.query(
      `UPDATE customer_service.customers
       SET tags = array_append(COALESCE(tags, ARRAY[]::varchar[]), $1)
       WHERE id = $2 AND NOT ($1 = ANY(COALESCE(tags, ARRAY[]::varchar[])))`,
      [tag, customerId]
    );

    log.info('Customer tag added', { customerId, tag });
  }

  /**
   * Remove tag from customer
   */
  async removeTag(customerId: string, tag: string): Promise<void> {
    await db.query(
      `UPDATE customer_service.customers
       SET tags = array_remove(tags, $1)
       WHERE id = $2`,
      [tag, customerId]
    );

    log.info('Customer tag removed', { customerId, tag });
  }

  /**
   * Get customer segments (for marketing)
   */
  async getCustomerSegments(): Promise<any> {
    const result = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE lifetime_value >= 1000) as high_value,
        COUNT(*) FILTER (WHERE lifetime_value >= 500 AND lifetime_value < 1000) as medium_value,
        COUNT(*) FILTER (WHERE lifetime_value < 500) as low_value,
        COUNT(*) FILTER (WHERE last_purchase >= NOW() - INTERVAL '30 days') as active_30d,
        COUNT(*) FILTER (WHERE last_purchase >= NOW() - INTERVAL '90 days' AND last_purchase < NOW() - INTERVAL '30 days') as at_risk,
        COUNT(*) FILTER (WHERE last_purchase < NOW() - INTERVAL '90 days') as churned
      FROM (
        SELECT
          c.id,
          COALESCE(SUM(t.total_amount), 0) as lifetime_value,
          MAX(t.created_at) as last_purchase
        FROM customer_service.customers c
        LEFT JOIN order_service.retail_transactions t ON c.id = t.customer_id AND t.status = 'COMPLETED'
        GROUP BY c.id
      ) sub`
    );

    return {
      byValue: {
        high: parseInt(result.rows[0].high_value),
        medium: parseInt(result.rows[0].medium_value),
        low: parseInt(result.rows[0].low_value),
      },
      byRecency: {
        active30d: parseInt(result.rows[0].active_30d),
        atRisk: parseInt(result.rows[0].at_risk),
        churned: parseInt(result.rows[0].churned),
      },
    };
  }

  /**
   * Get customers at risk (haven't purchased in 90+ days)
   */
  async getAtRiskCustomers(limit: number = 50): Promise<Customer[]> {
    const result = await db.query(
      `SELECT
        c.id, c.first_name as "firstName", c.last_name as "lastName",
        c.email, c.phone, c.last_purchase as "lastPurchase",
        COALESCE(SUM(t.total_amount), 0) as lifetime_value
      FROM customer_service.customers c
      LEFT JOIN order_service.retail_transactions t ON c.id = t.customer_id AND t.status = 'COMPLETED'
      WHERE c.last_purchase < NOW() - INTERVAL '90 days'
        AND c.last_purchase >= NOW() - INTERVAL '180 days'
      GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.last_purchase
      ORDER BY lifetime_value DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Link customer to transaction (after-the-fact)
   */
  async linkCustomerToTransaction(
    customerId: string,
    transactionId: string
  ): Promise<void> {
    await db.query(
      `UPDATE order_service.retail_transactions
       SET customer_id = $1
       WHERE id = $2`,
      [customerId, transactionId]
    );

    // Update last_purchase on customer
    await db.query(
      `UPDATE customer_service.customers
       SET last_purchase = (
         SELECT MAX(created_at)
         FROM order_service.retail_transactions
         WHERE customer_id = $1
       )
       WHERE id = $1`,
      [customerId]
    );

    log.info('Customer linked to transaction', { customerId, transactionId });
  }
}

// Singleton instance
export const customerService = new CustomerService();
