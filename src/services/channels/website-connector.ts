import { db } from '../../shared/database';
import { log } from '../../shared/logger';
import { eventBus } from '../../shared/events';
import { EventType } from '../../shared/types';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

/**
 * Website Connector Service
 * Integration with liquorriver.com or other e-commerce platforms
 * Supports: Custom API, Shopify, WooCommerce, BigCommerce
 */

export enum WebsitePlatform {
  CUSTOM = 'CUSTOM',
  SHOPIFY = 'SHOPIFY',
  WOOCOMMERCE = 'WOOCOMMERCE',
  BIGCOMMERCE = 'BIGCOMMERCE',
}

export interface WebsiteConfig {
  platform: WebsitePlatform;
  apiUrl: string;
  apiKey?: string;
  apiSecret?: string;
  shopName?: string; // For Shopify
  consumerKey?: string; // For WooCommerce
  consumerSecret?: string; // For WooCommerce
  storeHash?: string; // For BigCommerce
  webhookSecret?: string;
}

export interface WebsiteOrder {
  externalOrderId: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  items: Array<{
    sku: string;
    barcode?: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
  fulfillmentStatus: 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED';
  orderDate: Date;
  notes?: string;
}

export interface InventoryUpdate {
  sku: string;
  barcode?: string;
  quantityAvailable: number;
  price?: number;
}

export class WebsiteConnectorService {
  private config: WebsiteConfig;
  private client: AxiosInstance;

  constructor(config: WebsiteConfig) {
    this.config = config;

    // Initialize HTTP client based on platform
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: this.getAuthHeaders(),
    });
  }

  /**
   * Get authentication headers based on platform
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    switch (this.config.platform) {
      case WebsitePlatform.SHOPIFY:
        if (this.config.apiKey) {
          headers['X-Shopify-Access-Token'] = this.config.apiKey;
        }
        break;

      case WebsitePlatform.WOOCOMMERCE:
        if (this.config.consumerKey && this.config.consumerSecret) {
          const auth = Buffer.from(
            `${this.config.consumerKey}:${this.config.consumerSecret}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${auth}`;
        }
        break;

      case WebsitePlatform.BIGCOMMERCE:
        if (this.config.apiKey) {
          headers['X-Auth-Token'] = this.config.apiKey;
        }
        break;

      case WebsitePlatform.CUSTOM:
        if (this.config.apiKey) {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }
        break;
    }

    return headers;
  }

  /**
   * Fetch new orders from website
   */
  async fetchNewOrders(since?: Date): Promise<WebsiteOrder[]> {
    try {
      const endpoint = this.getOrdersEndpoint();
      const params = this.getOrdersParams(since);

      const response = await this.client.get(endpoint, { params });

      const orders = this.parseOrders(response.data);

      log.info('Fetched website orders', {
        platform: this.config.platform,
        count: orders.length,
        since,
      });

      return orders;
    } catch (error: any) {
      log.error('Failed to fetch website orders', {
        platform: this.config.platform,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get orders endpoint based on platform
   */
  private getOrdersEndpoint(): string {
    switch (this.config.platform) {
      case WebsitePlatform.SHOPIFY:
        return '/admin/api/2024-01/orders.json';
      case WebsitePlatform.WOOCOMMERCE:
        return '/wp-json/wc/v3/orders';
      case WebsitePlatform.BIGCOMMERCE:
        return `/stores/${this.config.storeHash}/v2/orders`;
      case WebsitePlatform.CUSTOM:
      default:
        return '/api/orders';
    }
  }

  /**
   * Get query parameters for orders based on platform
   */
  private getOrdersParams(since?: Date): Record<string, any> {
    const params: Record<string, any> = {
      status: 'any',
      limit: 100,
    };

    if (since) {
      switch (this.config.platform) {
        case WebsitePlatform.SHOPIFY:
          params['created_at_min'] = since.toISOString();
          break;
        case WebsitePlatform.WOOCOMMERCE:
          params['after'] = since.toISOString();
          break;
        case WebsitePlatform.BIGCOMMERCE:
          params['min_date_created'] = since.toISOString();
          break;
        case WebsitePlatform.CUSTOM:
          params['since'] = since.toISOString();
          break;
      }
    }

    return params;
  }

  /**
   * Parse orders from platform-specific response
   */
  private parseOrders(data: any): WebsiteOrder[] {
    switch (this.config.platform) {
      case WebsitePlatform.SHOPIFY:
        return this.parseShopifyOrders(data);
      case WebsitePlatform.WOOCOMMERCE:
        return this.parseWooCommerceOrders(data);
      case WebsitePlatform.BIGCOMMERCE:
        return this.parseBigCommerceOrders(data);
      case WebsitePlatform.CUSTOM:
      default:
        return this.parseCustomOrders(data);
    }
  }

  /**
   * Parse Shopify orders
   */
  private parseShopifyOrders(data: any): WebsiteOrder[] {
    const orders = data.orders || [];
    return orders.map((order: any) => ({
      externalOrderId: order.id.toString(),
      customerEmail: order.email,
      customerName: order.customer?.first_name + ' ' + order.customer?.last_name,
      customerPhone: order.customer?.phone,
      shippingAddress: order.shipping_address
        ? {
            street: order.shipping_address.address1,
            city: order.shipping_address.city,
            state: order.shipping_address.province_code,
            zipCode: order.shipping_address.zip,
          }
        : undefined,
      items: order.line_items.map((item: any) => ({
        sku: item.sku,
        barcode: item.barcode,
        name: item.name,
        quantity: item.quantity,
        price: parseFloat(item.price),
      })),
      subtotal: parseFloat(order.subtotal_price),
      tax: parseFloat(order.total_tax),
      shipping: parseFloat(order.total_shipping_price_set?.shop_money?.amount || '0'),
      total: parseFloat(order.total_price),
      paymentStatus: order.financial_status === 'paid' ? 'PAID' : 'PENDING',
      fulfillmentStatus: this.mapShopifyFulfillmentStatus(order.fulfillment_status),
      orderDate: new Date(order.created_at),
      notes: order.note,
    }));
  }

  /**
   * Parse WooCommerce orders
   */
  private parseWooCommerceOrders(data: any): WebsiteOrder[] {
    const orders = Array.isArray(data) ? data : [];
    return orders.map((order: any) => ({
      externalOrderId: order.id.toString(),
      customerEmail: order.billing.email,
      customerName: `${order.billing.first_name} ${order.billing.last_name}`,
      customerPhone: order.billing.phone,
      shippingAddress: {
        street: order.shipping.address_1,
        city: order.shipping.city,
        state: order.shipping.state,
        zipCode: order.shipping.postcode,
      },
      items: order.line_items.map((item: any) => ({
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        price: parseFloat(item.price),
      })),
      subtotal: parseFloat(order.total) - parseFloat(order.total_tax),
      tax: parseFloat(order.total_tax),
      shipping: parseFloat(order.shipping_total),
      total: parseFloat(order.total),
      paymentStatus: order.status === 'processing' || order.status === 'completed' ? 'PAID' : 'PENDING',
      fulfillmentStatus: this.mapWooCommerceFulfillmentStatus(order.status),
      orderDate: new Date(order.date_created),
      notes: order.customer_note,
    }));
  }

  /**
   * Parse BigCommerce orders
   */
  private parseBigCommerceOrders(data: any): WebsiteOrder[] {
    const orders = Array.isArray(data) ? data : [];
    return orders.map((order: any) => ({
      externalOrderId: order.id.toString(),
      customerEmail: order.billing_address.email,
      customerName: `${order.billing_address.first_name} ${order.billing_address.last_name}`,
      customerPhone: order.billing_address.phone,
      shippingAddress: order.shipping_addresses?.[0]
        ? {
            street: order.shipping_addresses[0].street_1,
            city: order.shipping_addresses[0].city,
            state: order.shipping_addresses[0].state,
            zipCode: order.shipping_addresses[0].zip,
          }
        : undefined,
      items: [], // Would need separate API call to get line items
      subtotal: parseFloat(order.subtotal_ex_tax),
      tax: parseFloat(order.total_tax),
      shipping: parseFloat(order.shipping_cost_ex_tax),
      total: parseFloat(order.total_inc_tax),
      paymentStatus: order.payment_status === 'captured' ? 'PAID' : 'PENDING',
      fulfillmentStatus: this.mapBigCommerceFulfillmentStatus(order.status),
      orderDate: new Date(order.date_created),
      notes: order.customer_message,
    }));
  }

  /**
   * Parse custom platform orders
   */
  private parseCustomOrders(data: any): WebsiteOrder[] {
    // Assume custom API returns orders in standardized format
    const orders = data.orders || data;
    return Array.isArray(orders) ? orders : [];
  }

  /**
   * Map fulfillment statuses
   */
  private mapShopifyFulfillmentStatus(status: string): 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED' {
    switch (status) {
      case 'fulfilled':
        return 'FULFILLED';
      case 'partial':
        return 'PARTIAL';
      case 'cancelled':
        return 'CANCELLED';
      default:
        return 'UNFULFILLED';
    }
  }

  private mapWooCommerceFulfillmentStatus(status: string): 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED' {
    switch (status) {
      case 'completed':
        return 'FULFILLED';
      case 'cancelled':
      case 'refunded':
      case 'failed':
        return 'CANCELLED';
      default:
        return 'UNFULFILLED';
    }
  }

  private mapBigCommerceFulfillmentStatus(status: string): 'UNFULFILLED' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED' {
    switch (status) {
      case 'Shipped':
      case 'Completed':
        return 'FULFILLED';
      case 'Cancelled':
      case 'Declined':
      case 'Refunded':
        return 'CANCELLED';
      default:
        return 'UNFULFILLED';
    }
  }

  /**
   * Import website order into POS system
   */
  async importOrder(websiteOrder: WebsiteOrder, storeId: string): Promise<string> {
    const transactionId = uuidv4();

    try {
      // Check if order already imported
      const existing = await db.query(
        `SELECT id FROM order_service.retail_transactions WHERE external_order_id = $1`,
        [websiteOrder.externalOrderId]
      );

      if (existing.rows.length > 0) {
        log.info('Order already imported', { externalOrderId: websiteOrder.externalOrderId });
        return existing.rows[0].id;
      }

      // Create transaction
      await db.query(
        `INSERT INTO order_service.retail_transactions (
          id, business_date, store_id, terminal_id, channel, status,
          subtotal, tax_amount, total_amount, external_order_id, created_at
        ) VALUES ($1, CURRENT_DATE, $2, 'WEBSITE', 'WEBSITE', $3, $4, $5, $6, $7, $8)`,
        [
          transactionId,
          storeId,
          websiteOrder.fulfillmentStatus === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
          websiteOrder.subtotal,
          websiteOrder.tax,
          websiteOrder.total,
          websiteOrder.externalOrderId,
          websiteOrder.orderDate,
        ]
      );

      // Add line items
      for (const item of websiteOrder.items) {
        // Find product by SKU or barcode
        const productResult = await db.query(
          `SELECT id FROM product_service.products WHERE barcode = $1 OR barcode = $2 LIMIT 1`,
          [item.sku, item.barcode]
        );

        if (productResult.rows.length === 0) {
          log.warn('Product not found for website order item', {
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
          });
          continue;
        }

        const productId = productResult.rows[0].id;

        await db.query(
          `INSERT INTO order_service.transaction_line_items (
            id, transaction_id, product_id, quantity, unit_price, extended_price, tax_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(),
            transactionId,
            productId,
            item.quantity,
            item.price,
            item.price * item.quantity,
            0, // Tax calculated at transaction level
          ]
        );
      }

      // Emit event
      eventBus.emit(EventType.WEBSITE_ORDER_IMPORTED, {
        transactionId,
        externalOrderId: websiteOrder.externalOrderId,
        storeId,
        total: websiteOrder.total,
        itemCount: websiteOrder.items.length,
        customerEmail: websiteOrder.customerEmail,
      });

      log.info('Website order imported', {
        transactionId,
        externalOrderId: websiteOrder.externalOrderId,
        total: websiteOrder.total,
      });

      return transactionId;
    } catch (error: any) {
      log.error('Failed to import website order', {
        externalOrderId: websiteOrder.externalOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update inventory on website
   */
  async updateInventory(updates: InventoryUpdate[]): Promise<void> {
    try {
      for (const update of updates) {
        await this.updateProductInventory(update);
      }

      log.info('Website inventory updated', { count: updates.length });
    } catch (error: any) {
      log.error('Failed to update website inventory', { error: error.message });
      throw error;
    }
  }

  /**
   * Update single product inventory
   */
  private async updateProductInventory(update: InventoryUpdate): Promise<void> {
    const endpoint = this.getInventoryEndpoint(update.sku);
    const payload = this.getInventoryPayload(update);

    try {
      await this.client.put(endpoint, payload);
    } catch (error: any) {
      log.error('Failed to update product inventory on website', {
        sku: update.sku,
        error: error.message,
      });
      // Don't throw - continue with other updates
    }
  }

  /**
   * Get inventory endpoint based on platform
   */
  private getInventoryEndpoint(sku: string): string {
    switch (this.config.platform) {
      case WebsitePlatform.SHOPIFY:
        return `/admin/api/2024-01/inventory_levels/set.json`;
      case WebsitePlatform.WOOCOMMERCE:
        return `/wp-json/wc/v3/products/${sku}`;
      case WebsitePlatform.BIGCOMMERCE:
        return `/stores/${this.config.storeHash}/v3/catalog/products/${sku}`;
      case WebsitePlatform.CUSTOM:
      default:
        return `/api/inventory/${sku}`;
    }
  }

  /**
   * Get inventory update payload based on platform
   */
  private getInventoryPayload(update: InventoryUpdate): any {
    switch (this.config.platform) {
      case WebsitePlatform.SHOPIFY:
        return {
          inventory_item_id: update.sku,
          available: update.quantityAvailable,
        };
      case WebsitePlatform.WOOCOMMERCE:
        return {
          stock_quantity: update.quantityAvailable,
          manage_stock: true,
        };
      case WebsitePlatform.BIGCOMMERCE:
        return {
          inventory_level: update.quantityAvailable,
        };
      case WebsitePlatform.CUSTOM:
      default:
        return {
          quantity: update.quantityAvailable,
          price: update.price,
        };
    }
  }

  /**
   * Update order status on website
   */
  async updateOrderStatus(
    externalOrderId: string,
    status: 'FULFILLED' | 'CANCELLED',
    trackingNumber?: string
  ): Promise<void> {
    try {
      const endpoint = this.getOrderUpdateEndpoint(externalOrderId);
      const payload = this.getOrderUpdatePayload(status, trackingNumber);

      await this.client.put(endpoint, payload);

      log.info('Website order status updated', {
        externalOrderId,
        status,
        trackingNumber,
      });
    } catch (error: any) {
      log.error('Failed to update website order status', {
        externalOrderId,
        status,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get order update endpoint
   */
  private getOrderUpdateEndpoint(externalOrderId: string): string {
    switch (this.config.platform) {
      case WebsitePlatform.SHOPIFY:
        return `/admin/api/2024-01/orders/${externalOrderId}.json`;
      case WebsitePlatform.WOOCOMMERCE:
        return `/wp-json/wc/v3/orders/${externalOrderId}`;
      case WebsitePlatform.BIGCOMMERCE:
        return `/stores/${this.config.storeHash}/v2/orders/${externalOrderId}`;
      case WebsitePlatform.CUSTOM:
      default:
        return `/api/orders/${externalOrderId}`;
    }
  }

  /**
   * Get order update payload
   */
  private getOrderUpdatePayload(status: 'FULFILLED' | 'CANCELLED', trackingNumber?: string): any {
    switch (this.config.platform) {
      case WebsitePlatform.SHOPIFY:
        return {
          order: {
            fulfillment_status: status === 'FULFILLED' ? 'fulfilled' : null,
            cancelled_at: status === 'CANCELLED' ? new Date().toISOString() : null,
          },
        };
      case WebsitePlatform.WOOCOMMERCE:
        return {
          status: status === 'FULFILLED' ? 'completed' : 'cancelled',
        };
      case WebsitePlatform.BIGCOMMERCE:
        return {
          status_id: status === 'FULFILLED' ? 10 : 5, // 10 = Completed, 5 = Cancelled
        };
      case WebsitePlatform.CUSTOM:
      default:
        return {
          status,
          trackingNumber,
        };
    }
  }
}

/**
 * Factory to create website connector based on config
 */
export function createWebsiteConnector(config: WebsiteConfig): WebsiteConnectorService {
  return new WebsiteConnectorService(config);
}

// Example usage configurations
export const LIQUOR_RIVER_CONFIG: WebsiteConfig = {
  platform: WebsitePlatform.CUSTOM,
  apiUrl: process.env.LIQUOR_RIVER_API_URL || 'https://liquorriver.com/api',
  apiKey: process.env.LIQUOR_RIVER_API_KEY,
  webhookSecret: process.env.LIQUOR_RIVER_WEBHOOK_SECRET,
};

export const websiteConnector = createWebsiteConnector(LIQUOR_RIVER_CONFIG);
