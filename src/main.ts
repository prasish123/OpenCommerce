import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './shared/config';
import { log } from './shared/logger';
import { db } from './shared/database';
import { ElistarSyncService } from './services/elistar-sync/elistar-sync-service';
import { ProductService } from './services/product/product-service';
import { OrderAggregationService } from './services/order-aggregation/order-aggregation-service';
import { CartService } from './services/pos-terminal/cart-service';
import { PaymentService } from './services/payment/payment-service';
import { ReceiptService } from './services/receipt/receipt-service';
import { DoorDashConnector } from './services/channels/doordash-connector';
import { UberEatsConnector } from './services/channels/uber-eats-connector';

/**
 * OpenCommerce POS - Main Application
 * Omnichannel Point of Sale with Elistar Integration
 */

const app = express();
const elistar = new ElistarSyncService();
const productService = new ProductService();
const orderService = new OrderAggregationService();
const cartService = new CartService();
const paymentService = new PaymentService();
const receiptService = new ReceiptService();
const doordash = new DoorDashConnector();
const uber = new UberEatsConnector();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'application/xml', limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  log.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await db.healthCheck();

  if (dbHealthy) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      store: config.store.id,
    });
  } else {
    res.status(503).json({
      status: 'unhealthy',
      reason: 'Database connection failed',
    });
  }
});

// ==========================================
// ELISTAR INTEGRATION
// ==========================================

/**
 * Import NAXML from Elistar
 * POST /api/elistar/import
 */
app.post('/api/elistar/import', async (req: Request, res: Response) => {
  try {
    // Verify authorization
    const authHeader = req.get('Authorization');
    const expectedAuth = `Bearer ${config.elistar.importSecret}`;

    if (authHeader !== expectedAuth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get XML content
    const xmlContent = typeof req.body === 'string' ? req.body : req.body.toString();

    if (!xmlContent || !xmlContent.includes('NAXML-MaintenanceRequest')) {
      return res.status(400).json({ error: 'Invalid NAXML format' });
    }

    // Import
    const result = await elistar.importNAXML(xmlContent);

    res.json(result);
  } catch (error) {
    log.error('NAXML import failed', error);
    res.status(500).json({
      error: 'Import failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Export transactions to Elistar
 * POST /api/elistar/export
 */
app.post('/api/elistar/export', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, storeId } = req.body;

    const result = await elistar.exportTransactions(
      new Date(startDate),
      new Date(endDate),
      storeId
    );

    res.json(result);
  } catch (error) {
    log.error('Transaction export failed', error);
    res.status(500).json({
      error: 'Export failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// PRODUCT API
// ==========================================

/**
 * Get product by barcode
 * GET /api/products/:barcode
 */
app.get('/api/products/:barcode', async (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;
    const { channel = 'IN_STORE' } = req.query;

    const product = await productService.getProductByBarcode(
      barcode,
      channel as any
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    log.error('Product lookup failed', error);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

/**
 * Search products
 * GET /api/products/search?q=query
 */
app.get('/api/products/search', async (req: Request, res: Response) => {
  try {
    const { q = '', limit = '20' } = req.query;

    const products = await productService.searchProducts(
      q as string,
      parseInt(limit as string)
    );

    res.json(products);
  } catch (error) {
    log.error('Product search failed', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ==========================================
// ORDER MANAGEMENT API
// ==========================================

/**
 * Get today's order queue (unified view)
 * GET /api/orders/today
 */
app.get('/api/orders/today', async (req: Request, res: Response) => {
  try {
    const orders = await orderService.getTodaysOrders();
    res.json(orders);
  } catch (error) {
    log.error('Failed to get orders', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

/**
 * Get order by ID
 * GET /api/orders/:id
 */
app.get('/api/orders/:id', async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    log.error('Failed to get order', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

/**
 * Update order status
 * PATCH /api/orders/:id/status
 */
app.patch('/api/orders/:id/status', async (req: Request, res: Response) => {
  try {
    const { status, userId } = req.body;
    await orderService.updateOrderStatus(req.params.id, status, userId);
    res.json({ success: true });
  } catch (error) {
    log.error('Failed to update order status', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * Record age verification
 * POST /api/orders/:id/verify-age
 */
app.post('/api/orders/:id/verify-age', async (req: Request, res: Response) => {
  try {
    const { driverLicenseNumber, verifiedBy } = req.body;
    await orderService.recordAgeVerification(
      req.params.id,
      driverLicenseNumber,
      verifiedBy
    );
    res.json({ success: true });
  } catch (error) {
    log.error('Failed to record age verification', error);
    res.status(500).json({ error: 'Failed to record verification' });
  }
});

// ==========================================
// POS CART API
// ==========================================

/**
 * Create new cart (start transaction)
 * POST /api/cart
 */
app.post('/api/cart', async (req: Request, res: Response) => {
  try {
    const cartId = cartService.createCart();
    res.json({ cartId });
  } catch (error) {
    log.error('Failed to create cart', error);
    res.status(500).json({ error: 'Failed to create cart' });
  }
});

/**
 * Add item to cart by barcode (scan)
 * POST /api/cart/:cartId/items
 */
app.post('/api/cart/:cartId/items', async (req: Request, res: Response) => {
  try {
    const { barcode, quantity = 1 } = req.body;
    const cart = await cartService.addItemByBarcode(
      req.params.cartId,
      barcode,
      quantity
    );
    res.json(cart);
  } catch (error) {
    log.error('Failed to add item to cart', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

/**
 * Update item quantity
 * PATCH /api/cart/:cartId/items/:barcode
 */
app.patch('/api/cart/:cartId/items/:barcode', async (req: Request, res: Response) => {
  try {
    const { quantity } = req.body;
    const cart = await cartService.updateQuantity(
      req.params.cartId,
      req.params.barcode,
      quantity
    );
    res.json(cart);
  } catch (error) {
    log.error('Failed to update quantity', error);
    res.status(500).json({ error: 'Failed to update quantity' });
  }
});

/**
 * Remove item from cart
 * DELETE /api/cart/:cartId/items/:barcode
 */
app.delete('/api/cart/:cartId/items/:barcode', async (req: Request, res: Response) => {
  try {
    const cart = await cartService.removeItem(
      req.params.cartId,
      req.params.barcode
    );
    res.json(cart);
  } catch (error) {
    log.error('Failed to remove item', error);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

/**
 * Get cart
 * GET /api/cart/:cartId
 */
app.get('/api/cart/:cartId', async (req: Request, res: Response) => {
  try {
    const cart = cartService.getCart(req.params.cartId);
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }
    res.json(cart);
  } catch (error) {
    log.error('Failed to get cart', error);
    res.status(500).json({ error: 'Failed to get cart' });
  }
});

/**
 * Clear cart (void)
 * DELETE /api/cart/:cartId
 */
app.delete('/api/cart/:cartId', async (req: Request, res: Response) => {
  try {
    const { reason, managerId } = req.body;
    await cartService.voidCart(req.params.cartId, reason, managerId);
    res.json({ success: true });
  } catch (error) {
    log.error('Failed to void cart', error);
    res.status(500).json({ error: 'Failed to void cart' });
  }
});

// ==========================================
// PAYMENT API
// ==========================================

/**
 * Process card payment
 * POST /api/payment/card
 */
app.post('/api/payment/card', async (req: Request, res: Response) => {
  try {
    const { transactionId, amount, terminalId } = req.body;
    const result = await paymentService.processCardPayment(
      transactionId,
      amount,
      terminalId
    );
    res.json(result);
  } catch (error) {
    log.error('Card payment failed', error);
    res.status(500).json({ error: 'Payment failed' });
  }
});

/**
 * Process cash payment
 * POST /api/payment/cash
 */
app.post('/api/payment/cash', async (req: Request, res: Response) => {
  try {
    const { transactionId, totalAmount, cashTendered } = req.body;
    const result = await paymentService.processCashPayment(
      transactionId,
      totalAmount,
      cashTendered
    );
    res.json(result);
  } catch (error) {
    log.error('Cash payment failed', error);
    res.status(500).json({ error: 'Payment failed' });
  }
});

/**
 * Open cash drawer
 * POST /api/payment/cash-drawer/open
 */
app.post('/api/payment/cash-drawer/open', async (req: Request, res: Response) => {
  try {
    await receiptService.openCashDrawer();
    res.json({ success: true });
  } catch (error) {
    log.error('Failed to open cash drawer', error);
    res.status(500).json({ error: 'Failed to open drawer' });
  }
});

/**
 * List Stripe Terminal readers
 * GET /api/payment/terminals
 */
app.get('/api/payment/terminals', async (req: Request, res: Response) => {
  try {
    const terminals = await paymentService.listTerminals();
    res.json(terminals);
  } catch (error) {
    log.error('Failed to list terminals', error);
    res.status(500).json({ error: 'Failed to list terminals' });
  }
});

// ==========================================
// RECEIPT API
// ==========================================

/**
 * Print receipt
 * POST /api/receipt/print
 */
app.post('/api/receipt/print', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    const order = await orderService.getOrder(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await receiptService.printReceiptFromOrder(order);
    res.json({ success: true });
  } catch (error) {
    log.error('Failed to print receipt', error);
    res.status(500).json({ error: 'Failed to print receipt' });
  }
});

// ==========================================
// CHANNEL WEBHOOKS
// ==========================================

/**
 * DoorDash order webhook
 * POST /webhooks/doordash/orders
 */
app.post('/webhooks/doordash/orders', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    const signature = req.get('X-DoorDash-Signature') || '';
    const timestamp = req.get('X-DoorDash-Timestamp') || '';

    const isValid = doordash.verifyWebhookSignature(
      JSON.stringify(req.body),
      signature,
      timestamp
    );

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const order = await doordash.handleOrderWebhook(req.body);
    res.json({ success: true, orderId: order?.id });
  } catch (error) {
    log.error('DoorDash webhook failed', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Uber Eats order webhook
 * POST /webhooks/uber/orders
 */
app.post('/webhooks/uber/orders', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    const signature = req.get('X-Uber-Signature') || '';
    const timestamp = req.get('X-Uber-Timestamp') || '';

    const isValid = uber.verifyWebhookSignature(
      JSON.stringify(req.body),
      signature,
      timestamp
    );

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const order = await uber.handleOrderWebhook(req.body);
    res.json({ success: true, orderId: order?.id });
  } catch (error) {
    log.error('Uber Eats webhook failed', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Sync menu to DoorDash
 * POST /api/channels/doordash/sync-menu
 */
app.post('/api/channels/doordash/sync-menu', async (req: Request, res: Response) => {
  try {
    await doordash.syncMenu();
    res.json({ success: true });
  } catch (error) {
    log.error('DoorDash menu sync failed', error);
    res.status(500).json({ error: 'Menu sync failed' });
  }
});

/**
 * Sync menu to Uber Eats
 * POST /api/channels/uber/sync-menu
 */
app.post('/api/channels/uber/sync-menu', async (req: Request, res: Response) => {
  try {
    await uber.syncMenu();
    res.json({ success: true });
  } catch (error) {
    log.error('Uber Eats menu sync failed', error);
    res.status(500).json({ error: 'Menu sync failed' });
  }
});

// ==========================================
// ERROR HANDLING
// ==========================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  log.error('Unhandled error', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.env === 'development' ? err.message : undefined,
  });
});

// ==========================================
// START SERVER
// ==========================================

async function start() {
  try {
    // Check database connection
    const dbHealthy = await db.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }

    log.info('Database connection established');

    // Start server
    app.listen(config.port, config.host, () => {
      log.info(`🚀 OpenCommerce POS started`, {
        port: config.port,
        env: config.env,
        store: config.store.id,
        storeName: config.store.name,
      });

      log.info(`API: http://${config.host}:${config.port}`);
      log.info(`Health: http://${config.host}:${config.port}/health`);
    });
  } catch (error) {
    log.error('Failed to start server', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down gracefully');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down gracefully');
  await db.close();
  process.exit(0);
});

// Start the application
start();
