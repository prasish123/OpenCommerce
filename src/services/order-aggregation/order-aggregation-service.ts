import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { eventBus } from '../../shared/event-bus';
import {
  UnifiedOrder,
  OrderChannel,
  OrderStatus,
  EventType,
  OrderItem,
} from '../../shared/types';
import { ProductService } from '../product/product-service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Order Aggregation Service
 * Receives orders from all channels and normalizes them into unified format
 * Handles auto-accept logic based on inventory availability
 */
export class OrderAggregationService {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  /**
   * Create order from any channel
   * Auto-accepts if inventory available, else requires manual review
   */
  async createOrder(order: Omit<UnifiedOrder, 'id'>): Promise<UnifiedOrder> {
    const orderId = uuidv4();

    try {
      // Check inventory for all items
      const inventoryChecks = await Promise.all(
        order.items.map((item) =>
          this.productService.checkInventory(item.productId, item.quantity)
        )
      );

      const allInStock = inventoryChecks.every((inStock) => inStock);

      // Auto-accept if all items in stock
      const status = allInStock ? OrderStatus.ACCEPTED : OrderStatus.NEW;

      // Check if order contains alcohol
      const containsAlcohol = order.items.some(
        (item) => item.requiresAgeVerification
      );

      // Start transaction
      await db.transaction(async (client) => {
        // Insert retail transaction
        await client.query(
          `INSERT INTO order_service.retail_transactions (
            id, channel, status, external_order_id,
            customer_name, customer_phone, customer_email,
            subtotal, tax_amount, total_amount,
            contains_alcohol, age_verified,
            delivery_address, driver_name, driver_phone,
            business_date, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_DATE, NOW())`,
          [
            orderId,
            order.channel,
            status,
            order.externalOrderId || null,
            order.customer?.name || null,
            order.customer?.phone || null,
            order.customer?.email || null,
            order.subtotal,
            order.taxAmount || 0,
            order.totalAmount,
            containsAlcohol,
            order.ageVerified || false,
            order.delivery?.address || null,
            order.delivery?.driver?.name || null,
            order.delivery?.driver?.phone || null,
          ]
        );

        // Insert line items
        for (let i = 0; i < order.items.length; i++) {
          const item = order.items[i];
          await client.query(
            `INSERT INTO order_service.transaction_line_items (
              transaction_id, line_number, product_id, barcode, description,
              quantity, unit_price, extended_price, tax_amount,
              requires_age_verification
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              orderId,
              i + 1,
              item.productId,
              item.barcode,
              item.description,
              item.quantity,
              item.unitPrice,
              item.extendedPrice,
              item.taxAmount || 0,
              item.requiresAgeVerification || false,
            ]
          );
        }

        // Record event
        await client.query(
          `INSERT INTO order_service.order_events (
            id, transaction_id, event_type, event_data, created_at
          ) VALUES ($1, $2, $3, $4, NOW())`,
          [
            uuidv4(),
            orderId,
            EventType.ORDER_CREATED,
            JSON.stringify({
              channel: order.channel,
              itemCount: order.items.length,
              autoAccepted: allInStock,
            }),
          ]
        );
      });

      // Publish event
      await eventBus.publish({
        type: EventType.ORDER_CREATED,
        aggregateId: orderId,
        data: {
          channel: order.channel,
          status,
          containsAlcohol,
          autoAccepted: allInStock,
        },
      });

      log.info('Order created', {
        orderId,
        channel: order.channel,
        status,
        itemCount: order.items.length,
        total: order.totalAmount,
        autoAccepted: allInStock,
      });

      return {
        id: orderId,
        ...order,
        status,
        containsAlcohol,
      };
    } catch (error) {
      log.error('Failed to create order', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    userId?: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Update status
      await client.query(
        `UPDATE order_service.retail_transactions
         SET status = $1, updated_at = NOW()
         WHERE id = $2`,
        [status, orderId]
      );

      // Record event
      const eventType =
        status === OrderStatus.ACCEPTED
          ? EventType.ORDER_ACCEPTED
          : status === OrderStatus.COMPLETED
          ? EventType.ORDER_COMPLETED
          : status === OrderStatus.CANCELLED
          ? EventType.ORDER_CANCELLED
          : EventType.ORDER_UPDATED;

      await client.query(
        `INSERT INTO order_service.order_events (
          id, transaction_id, event_type, event_data, created_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [
          uuidv4(),
          orderId,
          eventType,
          JSON.stringify({ status, updatedBy: userId }),
        ]
      );
    });

    // Publish event
    await eventBus.publish({
      type: EventType.ORDER_UPDATED,
      aggregateId: orderId,
      data: { status },
    });

    log.info('Order status updated', { orderId, status });
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<UnifiedOrder | null> {
    const result = await db.query(
      `SELECT
        t.id, t.channel, t.status, t.external_order_id as "externalOrderId",
        t.customer_name as "customerName", t.customer_phone as "customerPhone",
        t.customer_email as "customerEmail",
        t.subtotal, t.tax_amount as "taxAmount", t.total_amount as "totalAmount",
        t.contains_alcohol as "containsAlcohol", t.age_verified as "ageVerified",
        t.delivery_address as "deliveryAddress",
        t.driver_name as "driverName", t.driver_phone as "driverPhone",
        t.created_at as "createdAt", t.updated_at as "updatedAt"
      FROM order_service.retail_transactions t
      WHERE t.id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const order = result.rows[0];

    // Get line items
    const itemsResult = await db.query(
      `SELECT
        product_id as "productId", barcode, description,
        quantity, unit_price as "unitPrice", extended_price as "extendedPrice",
        tax_amount as "taxAmount", requires_age_verification as "requiresAgeVerification"
      FROM order_service.transaction_line_items
      WHERE transaction_id = $1
      ORDER BY line_number`,
      [orderId]
    );

    return {
      id: order.id,
      channel: order.channel,
      status: order.status,
      externalOrderId: order.externalOrderId,
      customer: order.customerName
        ? {
            name: order.customerName,
            phone: order.customerPhone,
            email: order.customerEmail,
          }
        : undefined,
      items: itemsResult.rows.map((row) => ({
        productId: row.productId,
        barcode: row.barcode,
        description: row.description,
        quantity: parseFloat(row.quantity),
        unitPrice: parseFloat(row.unitPrice),
        extendedPrice: parseFloat(row.extendedPrice),
        taxAmount: parseFloat(row.taxAmount),
        requiresAgeVerification: row.requiresAgeVerification,
      })),
      subtotal: parseFloat(order.subtotal),
      taxAmount: parseFloat(order.taxAmount),
      totalAmount: parseFloat(order.totalAmount),
      containsAlcohol: order.containsAlcohol,
      ageVerified: order.ageVerified,
      delivery: order.deliveryAddress
        ? {
            address: order.deliveryAddress,
            driver: order.driverName
              ? {
                  name: order.driverName,
                  phone: order.driverPhone,
                }
              : undefined,
          }
        : undefined,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Get all orders for today (unified queue)
   */
  async getTodaysOrders(storeId?: string): Promise<UnifiedOrder[]> {
    const result = await db.query(
      `SELECT
        t.id, t.channel, t.status, t.external_order_id as "externalOrderId",
        t.customer_name as "customerName",
        t.total_amount as "totalAmount",
        t.contains_alcohol as "containsAlcohol",
        t.created_at as "createdAt"
      FROM order_service.retail_transactions t
      WHERE t.business_date = CURRENT_DATE
        AND t.status NOT IN ('COMPLETED', 'CANCELLED')
      ORDER BY
        CASE
          WHEN t.status = 'NEW' THEN 1
          WHEN t.status = 'ACCEPTED' THEN 2
          WHEN t.status = 'PREPARING' THEN 3
          WHEN t.status = 'READY' THEN 4
          ELSE 5
        END,
        t.created_at ASC`
    );

    // For queue view, we don't need full item details
    return result.rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      status: row.status,
      externalOrderId: row.externalOrderId,
      customer: row.customerName ? { name: row.customerName } : undefined,
      items: [], // Empty for queue view, fetch full details when needed
      subtotal: 0,
      totalAmount: parseFloat(row.totalAmount),
      containsAlcohol: row.containsAlcohol,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Record age verification
   */
  async recordAgeVerification(
    orderId: string,
    driverLicenseNumber: string,
    verifiedBy: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Update order
      await client.query(
        `UPDATE order_service.retail_transactions
         SET age_verified = true
         WHERE id = $1`,
        [orderId]
      );

      // Record in compliance log
      await client.query(
        `INSERT INTO compliance_service.age_verification_logs (
          id, transaction_id, driver_license_number, verified_by, verified_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [uuidv4(), orderId, driverLicenseNumber, verifiedBy]
      );

      // Record event
      await client.query(
        `INSERT INTO order_service.order_events (
          id, transaction_id, event_type, event_data, created_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [
          uuidv4(),
          orderId,
          EventType.AGE_VERIFIED,
          JSON.stringify({ verifiedBy }),
        ]
      );
    });

    await eventBus.publish({
      type: EventType.AGE_VERIFIED,
      aggregateId: orderId,
      data: { verifiedBy },
    });

    log.info('Age verification recorded', { orderId, verifiedBy });
  }
}
