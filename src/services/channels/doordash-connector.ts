import axios from 'axios';
import { log } from '../../shared/logger';
import { config } from '../../shared/config';
import { OrderAggregationService } from '../order-aggregation/order-aggregation-service';
import { ProductService } from '../product/product-service';
import { OrderChannel, OrderStatus, UnifiedOrder, Product } from '../../shared/types';

/**
 * DoorDash Connector
 * Handles webhook integration and menu sync with DoorDash Drive API
 */

// DoorDash Order Webhook Payload
interface DoorDashWebhookPayload {
  order_id: string;
  status: string;
  customer: {
    first_name: string;
    last_name: string;
    phone_number: string;
    email?: string;
  };
  items: Array<{
    external_id: string; // Our barcode
    name: string;
    quantity: number;
    unit_price: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  delivery_address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  dasher?: {
    first_name: string;
    last_name: string;
    phone_number: string;
  };
}

export class DoorDashConnector {
  private orderService: OrderAggregationService;
  private productService: ProductService;
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.orderService = new OrderAggregationService();
    this.productService = new ProductService();
    this.baseUrl = config.doordash?.baseUrl || 'https://openapi.doordash.com';
    this.apiKey = config.doordash?.apiKey || '';
  }

  /**
   * Handle DoorDash order webhook
   * Called when new order arrives from DoorDash
   */
  async handleOrderWebhook(payload: DoorDashWebhookPayload): Promise<UnifiedOrder> {
    try {
      log.info('DoorDash order received', {
        orderId: payload.order_id,
        itemCount: payload.items.length,
        total: payload.total,
      });

      // Convert DoorDash order to UnifiedOrder format
      const unifiedOrder: Omit<UnifiedOrder, 'id'> = {
        channel: OrderChannel.DOORDASH,
        status: OrderStatus.NEW,
        storeId: config.store.id,
        businessDate: new Date(),
        externalOrderId: payload.order_id,
        customer: {
          name: `${payload.customer.first_name} ${payload.customer.last_name}`,
          phone: payload.customer.phone_number,
          email: payload.customer.email,
        },
        items: await Promise.all(
          payload.items.map(async (item) => {
            // Look up product by barcode (external_id)
            const product = await this.productService.getProductByBarcode(
              item.external_id,
              OrderChannel.DOORDASH
            );

            if (!product) {
              throw new Error(`Product not found: ${item.external_id}`);
            }

            return {
              sequenceNumber: 0, // Will be set later
              productId: product.id,
              barcode: product.barcode,
              description: product.description,
              quantity: item.quantity,
              unitPrice: item.unit_price,
              extendedPrice: item.unit_price * item.quantity,
              taxAmount: 0, // Tax calculated separately
              requiresAgeVerification: product.requiresAgeVerification,
            };
          })
        ),
        subtotal: payload.subtotal,
        taxTotal: payload.tax,
        totalAmount: payload.total,
        containsAlcohol: false, // Will be determined by products
        orderedAt: new Date(),
        delivery: {
          address: `${payload.delivery_address.street}, ${payload.delivery_address.city}, ${payload.delivery_address.state} ${payload.delivery_address.zip}`,
          driver: payload.dasher
            ? {
                name: `${payload.dasher.first_name} ${payload.dasher.last_name}`,
                phone: payload.dasher.phone_number,
              }
            : undefined,
        },
      };

      // Create order in aggregation service
      const order = await this.orderService.createOrder(unifiedOrder);

      // Auto-accept back to DoorDash if order was auto-accepted
      if (order.status === OrderStatus.ACCEPTED) {
        await this.acceptOrder(payload.order_id);
      }

      return order;
    } catch (error) {
      log.error('DoorDash order processing failed', error);
      throw error;
    }
  }

  /**
   * Accept order in DoorDash
   */
  async acceptOrder(doordashOrderId: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/drive/v2/orders/${doordashOrderId}/accept`,
        {},
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      log.info('DoorDash order accepted', { orderId: doordashOrderId });
    } catch (error) {
      log.error('Failed to accept DoorDash order', error);
      throw error;
    }
  }

  /**
   * Update order status in DoorDash
   */
  async updateOrderStatus(
    doordashOrderId: string,
    status: 'preparing' | 'ready_for_pickup' | 'completed' | 'cancelled'
  ): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/drive/v2/orders/${doordashOrderId}/${status}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      log.info('DoorDash order status updated', {
        orderId: doordashOrderId,
        status,
      });
    } catch (error) {
      log.error('Failed to update DoorDash order status', error);
      throw error;
    }
  }

  /**
   * Sync menu to DoorDash
   * Pushes all active products with DoorDash pricing
   */
  async syncMenu(): Promise<void> {
    try {
      log.info('Starting DoorDash menu sync');

      // Get all products for DoorDash channel
      const products = await this.productService.getAllProducts(
        OrderChannel.DOORDASH
      );

      // Group products by merchandise code (category)
      const categories = this.groupProductsByCategory(products);

      // Build DoorDash menu payload
      const menuPayload = {
        store_id: config.store.id,
        menu: {
          categories: categories.map((cat) => ({
            name: cat.name,
            items: cat.products.map((product) => ({
              external_id: product.barcode,
              name: product.description,
              description: product.description,
              price: Math.round((product as any).price * 100), // Convert to cents
              is_available: true,
              alcohol: product.requiresAgeVerification || false,
              image_url: null, // Image URL not available in Product type
            })),
          })),
        },
      };

      // Send to DoorDash
      await axios.put(`${this.baseUrl}/drive/v2/stores/${config.store.id}/menu`, menuPayload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      log.info('DoorDash menu synced successfully', {
        productCount: products.length,
        categoryCount: categories.length,
      });
    } catch (error) {
      log.error('DoorDash menu sync failed', error);
      throw error;
    }
  }

  /**
   * Update product availability in DoorDash
   */
  async updateProductAvailability(
    barcode: string,
    available: boolean
  ): Promise<void> {
    try {
      await axios.patch(
        `${this.baseUrl}/drive/v2/stores/${config.store.id}/items/${barcode}`,
        { is_available: available },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      log.info('DoorDash product availability updated', { barcode, available });
    } catch (error) {
      log.error('Failed to update DoorDash product availability', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature (security)
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string
  ): boolean {
    const crypto = require('crypto');
    const webhookSecret = config.doordash?.webhookSecret || '';

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Helper: Group products by category
   */
  private groupProductsByCategory(
    products: Product[]
  ): Array<{ name: string; products: Product[] }> {
    const grouped = new Map<string, Product[]>();

    for (const product of products) {
      const category = product.merchandiseCode || 'General';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(product);
    }

    return Array.from(grouped.entries()).map(([name, products]) => ({
      name,
      products,
    }));
  }
}
