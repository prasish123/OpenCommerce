import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './shared/config';
import { log } from './shared/logger';
import { db } from './shared/database';
import { ElistarSyncService } from './services/elistar-sync/elistar-sync-service';
import { ProductService } from './services/product/product-service';

/**
 * OpenCommerce POS - Main Application
 * Omnichannel Point of Sale with Elistar Integration
 */

const app = express();
const elistar = new ElistarSyncService();
const productService = new ProductService();

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
