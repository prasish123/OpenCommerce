import axios from 'axios';
import { log } from '../../shared/logger';
import { config } from '../../shared/config';
import { OrderAggregationService } from '../order-aggregation/order-aggregation-service';
import { ProductService } from '../product/product-service';
import { OrderChannel, OrderStatus, UnifiedOrder, Product } from '../../shared/types';

/**
 * Uber Eats Connector
 * Handles webhook integration and menu sync with Uber Eats API
 */

// Uber Eats Order Webhook Payload
interface UberEatsWebhookPayload {
  id: string;
  type: 'ORDER_CREATED' | 'ORDER_ACCEPTED' | 'ORDER_CANCELLED';
  resource_href: string;
  event_id: string;
  event_time: number;
  meta: {
    user_id: string;
    resource_id: string;
  };
}

interface UberEatsOrder {
  id: string;
  display_id: string;
  status: string;
  eater: {
    first_name: string;
    last_name: string;
    phone: string;
  };
  cart: {
    items: Array<{
      id: string;
      external_data: string; // Our barcode
      title: string;
      quantity: number;
      price: {
        total: number; // In cents
        unit_price: {
          amount: number; // In cents
        };
      };
    }>;
  };
  payment: {
    charges: {
      total: {
        amount: number; // In cents
      };
      sub_total: {
        amount: number; // In cents
      };
      tax: {
        amount: number; // In cents
      };
    };
  };
  delivery?: {
    location: {
      address: {
        street_address: string[];
        city: string;
        state: string;
        postal_code: string;
      };
    };
    courier?: {
      name: string;
      phone: string;
    };
  };
}

export class UberEatsConnector {
  private orderService: OrderAggregationService;
  private productService: ProductService;
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken?: string;

  constructor() {
    this.orderService = new OrderAggregationService();
    this.productService = new ProductService();
    this.baseUrl = config.uberEats?.baseUrl || 'https://api.uber.com';
    this.clientId = config.uberEats?.clientId || '';
    this.clientSecret = config.uberEats?.clientSecret || '';
  }

  /**
   * Get OAuth access token
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/oauth/v2/token`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
          scope: 'eats.store',
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      return this.accessToken!;
    } catch (error) {
      log.error('Failed to get Uber Eats access token', error);
      throw error;
    }
  }

  /**
   * Handle Uber Eats order webhook
   */
  async handleOrderWebhook(payload: UberEatsWebhookPayload): Promise<UnifiedOrder | null> {
    try {
      log.info('Uber Eats webhook received', {
        type: payload.type,
        orderId: payload.meta.resource_id,
      });

      // Only process new orders
      if (payload.type !== 'ORDER_CREATED') {
        return null;
      }

      // Fetch full order details
      const order = await this.fetchOrder(payload.meta.resource_id);

      // Convert to UnifiedOrder format
      const unifiedOrder: Omit<UnifiedOrder, 'id'> = {
        channel: OrderChannel.UBER_EATS,
        status: OrderStatus.NEW,
        externalOrderId: order.id,
        customer: {
          name: `${order.eater.first_name} ${order.eater.last_name}`,
          phone: order.eater.phone,
        },
        items: await Promise.all(
          order.cart.items.map(async (item) => {
            // Look up product by barcode (external_data)
            const product = await this.productService.getProductByBarcode(
              item.external_data,
              OrderChannel.UBER_EATS
            );

            if (!product) {
              throw new Error(`Product not found: ${item.external_data}`);
            }

            return {
              productId: product.id,
              barcode: product.barcode,
              description: product.description,
              quantity: item.quantity,
              unitPrice: item.price.unit_price.amount / 100, // Convert from cents
              extendedPrice: item.price.total / 100, // Convert from cents
              requiresAgeVerification: product.requiresAgeVerification,
            };
          })
        ),
        subtotal: order.payment.charges.sub_total.amount / 100,
        taxAmount: order.payment.charges.tax.amount / 100,
        totalAmount: order.payment.charges.total.amount / 100,
        delivery: order.delivery
          ? {
              address: `${order.delivery.location.address.street_address.join(', ')}, ${
                order.delivery.location.address.city
              }, ${order.delivery.location.address.state} ${
                order.delivery.location.address.postal_code
              }`,
              driver: order.delivery.courier
                ? {
                    name: order.delivery.courier.name,
                    phone: order.delivery.courier.phone,
                  }
                : undefined,
            }
          : undefined,
      };

      // Create order in aggregation service
      const createdOrder = await this.orderService.createOrder(unifiedOrder);

      // Auto-accept back to Uber if order was auto-accepted
      if (createdOrder.status === OrderStatus.ACCEPTED) {
        await this.acceptOrder(order.id);
      }

      return createdOrder;
    } catch (error) {
      log.error('Uber Eats order processing failed', error);
      throw error;
    }
  }

  /**
   * Fetch order details from Uber Eats
   */
  private async fetchOrder(orderId: string): Promise<UberEatsOrder> {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get<UberEatsOrder>(
        `${this.baseUrl}/v1/eats/orders/${orderId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      log.error('Failed to fetch Uber Eats order', error);
      throw error;
    }
  }

  /**
   * Accept order in Uber Eats
   */
  async acceptOrder(uberOrderId: string): Promise<void> {
    try {
      const token = await this.getAccessToken();

      await axios.post(
        `${this.baseUrl}/v1/eats/orders/${uberOrderId}/accept_pos_order`,
        {
          reason: 'ITEM_AVAILABILITY',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      log.info('Uber Eats order accepted', { orderId: uberOrderId });
    } catch (error) {
      log.error('Failed to accept Uber Eats order', error);
      throw error;
    }
  }

  /**
   * Update order status in Uber Eats
   */
  async updateOrderStatus(
    uberOrderId: string,
    status: 'started' | 'ready_for_pickup' | 'completed' | 'cancelled'
  ): Promise<void> {
    try {
      const token = await this.getAccessToken();

      await axios.post(
        `${this.baseUrl}/v1/eats/orders/${uberOrderId}/${status}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      log.info('Uber Eats order status updated', {
        orderId: uberOrderId,
        status,
      });
    } catch (error) {
      log.error('Failed to update Uber Eats order status', error);
      throw error;
    }
  }

  /**
   * Sync menu to Uber Eats
   */
  async syncMenu(): Promise<void> {
    try {
      log.info('Starting Uber Eats menu sync');

      const token = await this.getAccessToken();

      // Get all products for Uber Eats channel
      const products = await this.productService.getAllProducts(
        OrderChannel.UBER_EATS
      );

      // Group by category
      const categories = this.groupProductsByCategory(products);

      // Build Uber Eats menu payload
      const menuPayload = {
        menus: [
          {
            id: `${config.store.id}-main`,
            title: {
              translations: {
                'en-US': 'Main Menu',
              },
            },
            subtitle: {
              translations: {
                'en-US': 'All Products',
              },
            },
            service_availability: [
              {
                day_of_week: 'monday',
                time_periods: [{ start_time: '00:00', end_time: '23:59' }],
              },
              {
                day_of_week: 'tuesday',
                time_periods: [{ start_time: '00:00', end_time: '23:59' }],
              },
              {
                day_of_week: 'wednesday',
                time_periods: [{ start_time: '00:00', end_time: '23:59' }],
              },
              {
                day_of_week: 'thursday',
                time_periods: [{ start_time: '00:00', end_time: '23:59' }],
              },
              {
                day_of_week: 'friday',
                time_periods: [{ start_time: '00:00', end_time: '23:59' }],
              },
              {
                day_of_week: 'saturday',
                time_periods: [{ start_time: '00:00', end_time: '23:59' }],
              },
              {
                day_of_week: 'sunday',
                time_periods: [{ start_time: '00:00', end_time: '23:59' }],
              },
            ],
            category_ids: categories.map((cat) => cat.name),
          },
        ],
        categories: categories.map((cat) => ({
          id: cat.name,
          title: {
            translations: {
              'en-US': cat.name,
            },
          },
          entities: cat.products.map((p) => ({
            id: p.barcode,
            type: 'ITEM',
          })),
        })),
        items: products.map((product) => ({
          id: product.barcode,
          external_data: product.barcode,
          title: {
            translations: {
              'en-US': product.description,
            },
          },
          price_info: {
            price: Math.round((product as any).price * 100), // Convert to cents
            overrides: [],
          },
          quantity_info: {
            quantity: {
              max_permitted: 99,
            },
          },
          suspension_info: {
            suspension: {
              suspend_until: null,
              reason: null,
            },
          },
          alcohol_info: product.requiresAgeVerification
            ? {
                is_alcohol: true,
              }
            : undefined,
          image_url: product.imageUrl || null,
        })),
      };

      // Send to Uber Eats
      await axios.post(
        `${this.baseUrl}/v1/eats/stores/${config.store.id}/menus`,
        menuPayload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      log.info('Uber Eats menu synced successfully', {
        productCount: products.length,
        categoryCount: categories.length,
      });
    } catch (error) {
      log.error('Uber Eats menu sync failed', error);
      throw error;
    }
  }

  /**
   * Update product availability in Uber Eats
   */
  async updateProductAvailability(
    barcode: string,
    available: boolean
  ): Promise<void> {
    try {
      const token = await this.getAccessToken();

      await axios.patch(
        `${this.baseUrl}/v1/eats/stores/${config.store.id}/items/${barcode}`,
        {
          suspension_info: {
            suspension: available
              ? null
              : {
                  suspend_until: null, // Indefinite
                  reason: 'OUT_OF_STOCK',
                },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      log.info('Uber Eats product availability updated', { barcode, available });
    } catch (error) {
      log.error('Failed to update Uber Eats product availability', error);
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
    const webhookSecret = config.uberEats?.webhookSecret || '';

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}${payload}`)
      .digest('base64');

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
