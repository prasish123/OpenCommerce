import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import cron from 'node-cron';
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
import { authService } from './services/auth/auth-service';
import { initPhotoStorageService, getPhotoStorageService } from './services/security/photo-storage-service';
import { syncService, SyncStrategy } from './services/offline/sync-service';

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

// Configure multer for file uploads (in-memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

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
// AUTHENTICATION & AUTHORIZATION
// ==========================================

/**
 * Login with PIN
 * POST /api/auth/login
 */
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { pin, terminalId } = req.body;

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: 'Invalid PIN format (must be 4-6 digits)' });
    }

    const result = await authService.loginWithPIN(pin, req.ip, terminalId);

    if (result.success) {
      res.json({
        token: result.token,
        user: result.user,
        sessionId: result.sessionId,
      });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (error) {
    log.error('Login failed', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Verify Manager Override
 * POST /api/auth/verify-manager
 *
 * Request body:
 * {
 *   "pin": "5678",
 *   "action": "transaction.void" | "price.override" | "drawer.open",
 *   "terminalId": "POS-001"
 * }
 */
app.post('/api/auth/verify-manager', async (req: Request, res: Response) => {
  try {
    const { pin, action, terminalId } = req.body;

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: 'Invalid PIN format' });
    }

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    const result = await authService.verifyManagerOverride(
      pin,
      action,
      req.ip,
      terminalId
    );

    if (result.success) {
      res.json({
        authorized: true,
        managerId: result.managerId,
        managerRole: result.managerRole,
        overrideToken: result.overrideToken,
        expiresIn: 300, // 5 minutes in seconds
      });
    } else {
      res.status(403).json({
        authorized: false,
        error: result.error,
      });
    }
  } catch (error) {
    log.error('Manager override verification failed', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * Logout
 * POST /api/auth/logout
 */
app.post('/api/auth/logout', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (sessionId) {
      await authService.logout(sessionId);
    }

    res.json({ success: true });
  } catch (error) {
    log.error('Logout failed', error);
    res.status(500).json({ error: 'Logout failed' });
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
 *
 * Supports multipart/form-data for photo upload:
 * - photo: Image file (optional, JPEG/PNG/WebP, max 10MB)
 * - driverLicenseNumber: string
 * - verifiedBy: string (cashier/manager ID)
 * - verificationMethod: 'MANUAL_ID_CHECK' | 'ID_SCANNER' | 'PHOTO_UPLOAD' (optional)
 * - customerName: string (optional)
 * - driverName: string (optional)
 * - driverLicenseState: string (optional)
 * - driverDob: string (optional, YYYY-MM-DD)
 */
app.post('/api/orders/:id/verify-age', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const { driverLicenseNumber, verifiedBy, verificationMethod, customerName, driverName, driverLicenseState, driverDob } = req.body;

    if (!driverLicenseNumber || !verifiedBy) {
      return res.status(400).json({ error: 'driverLicenseNumber and verifiedBy are required' });
    }

    let photoPath: string | undefined;

    // Handle photo upload if present
    if (req.file) {
      const photoStorage = getPhotoStorageService();
      const storedPhoto = await photoStorage.storePhoto(
        req.file.buffer,
        req.file.mimetype,
        {
          transactionId: req.params.id,
          verifiedBy
        }
      );
      photoPath = storedPhoto.fileName; // Store just the filename, not full path
      log.info('Age verification photo stored', {
        orderId: req.params.id,
        fileName: storedPhoto.fileName,
        size: storedPhoto.size
      });
    }

    // Record verification with optional photo
    await orderService.recordAgeVerification(
      req.params.id,
      driverLicenseNumber,
      verifiedBy,
      {
        photoPath,
        verificationMethod: verificationMethod as any,
        customerName,
        driverName,
        driverLicenseState,
        driverDob
      }
    );

    res.json({
      success: true,
      photoStored: !!photoPath,
      verificationMethod: photoPath ? 'PHOTO_UPLOAD' : (verificationMethod || 'MANUAL_ID_CHECK')
    });
  } catch (error) {
    log.error('Failed to record age verification', error);
    res.status(500).json({ error: 'Failed to record verification' });
  }
});

/**
 * Retrieve age verification photo (for audits)
 * GET /api/compliance/age-verification-photo/:fileName
 *
 * Admin only - requires authentication
 */
app.get('/api/compliance/age-verification-photo/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;

    // TODO: Add admin authentication check
    // For now, log the access for audit purposes
    log.info('Age verification photo accessed', {
      fileName,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    const photoStorage = getPhotoStorageService();
    const { buffer, mimeType } = await photoStorage.retrievePhoto(fileName);

    res.set('Content-Type', mimeType);
    res.set('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    log.error('Failed to retrieve age verification photo', { error, fileName: req.params.fileName });
    res.status(404).json({ error: 'Photo not found' });
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
 * Override item price (requires manager authorization)
 * POST /api/cart/:cartId/items/:barcode/override-price
 */
app.post('/api/cart/:cartId/items/:barcode/override-price', async (req: Request, res: Response) => {
  try {
    const { newPrice, overrideToken, reason } = req.body;

    if (!newPrice || newPrice <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    if (!overrideToken) {
      return res.status(403).json({ error: 'Manager override required' });
    }

    // Verify override token
    const tokenValid = await authService.verifyOverrideToken(overrideToken, 'transaction.discount');
    if (!tokenValid.valid) {
      return res.status(403).json({ error: 'Invalid or expired override token' });
    }

    // Apply price override
    const cart = await cartService.overridePrice(
      req.params.cartId,
      req.params.barcode,
      newPrice,
      tokenValid.managerId!,
      reason || 'Manager override'
    );

    res.json(cart);
  } catch (error) {
    log.error('Failed to override price', error);
    res.status(500).json({ error: 'Failed to override price' });
  }
});

/**
 * Clear cart (void) - requires manager authorization
 * DELETE /api/cart/:cartId
 */
app.delete('/api/cart/:cartId', async (req: Request, res: Response) => {
  try {
    const { reason, overrideToken } = req.body;

    if (!overrideToken) {
      return res.status(403).json({ error: 'Manager override required' });
    }

    // Verify override token
    const tokenValid = await authService.verifyOverrideToken(overrideToken, 'transaction.void');
    if (!tokenValid.valid) {
      return res.status(403).json({ error: 'Invalid or expired override token' });
    }

    await cartService.voidCart(req.params.cartId, reason || 'Voided', tokenValid.managerId!);
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
 * Returns receipt text for display (simulated mode) or confirms print (hardware mode)
 */
app.post('/api/receipt/print', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    const order = await orderService.getOrder(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const result = await receiptService.printReceiptFromOrder(order);
    res.json({
      success: true,
      printed: result.printed,
      receiptText: result.receiptText,
      mode: result.printed ? 'hardware' : 'simulated',
    });
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
// OFFLINE SYNC & CONFLICT RESOLUTION API
// ==========================================

/**
 * Get pending conflicts
 * GET /api/sync/conflicts/pending
 */
app.get('/api/sync/conflicts/pending', async (req: Request, res: Response) => {
  try {
    const conflicts = await syncService.getPendingConflicts();
    res.json({ conflicts, count: conflicts.length });
  } catch (error) {
    log.error('Failed to get pending conflicts', error);
    res.status(500).json({ error: 'Failed to retrieve conflicts' });
  }
});

/**
 * Get all conflicts (including resolved)
 * GET /api/sync/conflicts
 */
app.get('/api/sync/conflicts', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const conflicts = await syncService.getAllConflicts(limit);
    res.json({ conflicts, count: conflicts.length });
  } catch (error) {
    log.error('Failed to get conflicts', error);
    res.status(500).json({ error: 'Failed to retrieve conflicts' });
  }
});

/**
 * Manually resolve a conflict
 * POST /api/sync/conflicts/:id/resolve
 *
 * Body: { resolution: 'LOCAL_WINS' | 'SERVER_WINS' | 'MERGED', resolvedBy: string }
 */
app.post('/api/sync/conflicts/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { resolution, resolvedBy } = req.body;
    const conflictId = req.params.id;

    if (!resolution || !resolvedBy) {
      return res.status(400).json({ error: 'resolution and resolvedBy are required' });
    }

    if (!['LOCAL_WINS', 'SERVER_WINS', 'MERGED'].includes(resolution)) {
      return res.status(400).json({ error: 'Invalid resolution. Must be LOCAL_WINS, SERVER_WINS, or MERGED' });
    }

    await syncService.manuallyResolveConflict(conflictId, resolution, resolvedBy);
    res.json({ success: true, conflictId, resolution });
  } catch (error) {
    log.error('Failed to resolve conflict', error);
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

/**
 * Ignore a conflict
 * POST /api/sync/conflicts/:id/ignore
 *
 * Body: { resolvedBy: string }
 */
app.post('/api/sync/conflicts/:id/ignore', async (req: Request, res: Response) => {
  try {
    const { resolvedBy } = req.body;
    const conflictId = req.params.id;

    if (!resolvedBy) {
      return res.status(400).json({ error: 'resolvedBy is required' });
    }

    await syncService.ignoreConflict(conflictId, resolvedBy);
    res.json({ success: true, conflictId });
  } catch (error) {
    log.error('Failed to ignore conflict', error);
    res.status(500).json({ error: 'Failed to ignore conflict' });
  }
});

/**
 * Force sync now
 * POST /api/sync/force
 *
 * Body: { storeId: string, terminalId: string }
 */
app.post('/api/sync/force', async (req: Request, res: Response) => {
  try {
    const { storeId, terminalId } = req.body;

    if (!storeId || !terminalId) {
      return res.status(400).json({ error: 'storeId and terminalId are required' });
    }

    const result = await syncService.forceSyncNow(storeId, terminalId);
    res.json({
      success: result.success,
      recordsSynced: result.recordsSynced,
      conflicts: result.conflicts,
      errors: result.errors,
    });
  } catch (error) {
    log.error('Failed to force sync', error);
    res.status(500).json({ error: 'Failed to force sync' });
  }
});

/**
 * Get sync status
 * GET /api/sync/status
 */
app.get('/api/sync/status', async (req: Request, res: Response) => {
  try {
    const status = await syncService.getSyncStatus();
    res.json(status);
  } catch (error) {
    log.error('Failed to get sync status', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * Set sync strategy
 * POST /api/sync/strategy
 *
 * Body: { strategy: 'SERVER_WINS' | 'LOCAL_WINS' | 'LAST_WRITE_WINS' | 'MANUAL' }
 */
app.post('/api/sync/strategy', async (req: Request, res: Response) => {
  try {
    const { strategy } = req.body;

    if (!strategy || !Object.values(SyncStrategy).includes(strategy)) {
      return res.status(400).json({
        error: 'Invalid strategy. Must be one of: SERVER_WINS, LOCAL_WINS, LAST_WRITE_WINS, MANUAL',
      });
    }

    syncService.setSyncStrategy(strategy as SyncStrategy);
    res.json({ success: true, strategy });
  } catch (error) {
    log.error('Failed to set sync strategy', error);
    res.status(500).json({ error: 'Failed to set sync strategy' });
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

    // Initialize photo storage service for age verification
    await initPhotoStorageService();
    log.info('Photo storage service initialized');

    // Schedule daily cleanup of old age verification photos (runs at 2 AM)
    cron.schedule('0 2 * * *', async () => {
      log.info('Starting age verification photo cleanup...');
      try {
        const photoStorage = getPhotoStorageService();
        const deletedCount = await photoStorage.cleanupOldPhotos();
        log.info(`Age verification photo cleanup completed: ${deletedCount} photos deleted`);
      } catch (error) {
        log.error('Age verification photo cleanup failed', error);
      }
    });
    log.info('Photo cleanup cron job scheduled (daily at 2 AM)');

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
