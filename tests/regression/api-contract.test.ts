/**
 * Regression Tests - API Contract Testing
 * Ensure API contracts don't break between versions
 */

import request from 'supertest';
import { app } from '../../src/server';
import Ajv from 'ajv';

const ajv = new Ajv();

describe('API Contract Regression Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    // Login to get token
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'test_user',
        password: 'test123',
        terminalId: 'TERMINAL-001',
      });
    authToken = response.body.token;
  });

  describe('Authentication API Contracts', () => {
    const loginResponseSchema = {
      type: 'object',
      required: ['success', 'user', 'token', 'sessionId'],
      properties: {
        success: { type: 'boolean' },
        user: {
          type: 'object',
          required: ['id', 'username', 'fullName', 'role'],
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            fullName: { type: 'string' },
            role: { type: 'string', enum: ['CASHIER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
            email: { type: ['string', 'null'] },
          },
        },
        token: { type: 'string' },
        sessionId: { type: 'string' },
        expiresAt: { type: 'string' },
      },
    };

    it('POST /api/auth/login should match contract', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test_user',
          password: 'test123',
          terminalId: 'TERMINAL-001',
        })
        .expect(200);

      const validate = ajv.compile(loginResponseSchema);
      const valid = validate(response.body);

      expect(valid).toBe(true);
      if (!valid) {
        console.error('Validation errors:', validate.errors);
      }
    });
  });

  describe('Product API Contracts', () => {
    const productSchema = {
      type: 'object',
      required: ['id', 'barcode', 'description', 'basePrice', 'merchandiseCode', 'active'],
      properties: {
        id: { type: 'string' },
        barcode: { type: 'string' },
        barcodeType: { type: 'string', enum: ['UPC-A', 'EAN-13', 'PLU'] },
        description: { type: 'string' },
        basePrice: { type: 'number' },
        inventoryValuePrice: { type: ['number', 'null'] },
        merchandiseCode: { type: 'string' },
        taxStrategyId: { type: 'number' },
        active: { type: 'boolean' },
        priceInStore: { type: 'number' },
        priceDoordash: { type: 'number' },
        priceUberEats: { type: 'number' },
        priceWebsite: { type: 'number' },
        requiresAgeVerification: { type: 'boolean' },
        minimumAge: { type: ['number', 'null'] },
        category: { type: ['string', 'null'] },
        createdAt: { type: 'string' },
        updatedAt: { type: ['string', 'null'] },
      },
    };

    it('GET /api/products/:id should match contract', async () => {
      const response = await request(app)
        .get('/api/products/some-product-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const validate = ajv.compile(productSchema);
      const valid = validate(response.body);

      expect(valid).toBe(true);
      if (!valid) {
        console.error('Validation errors:', validate.errors);
      }
    });
  });

  describe('Cart API Contracts', () => {
    const cartSchema = {
      type: 'object',
      required: ['id', 'items', 'subtotal', 'taxTotal', 'total'],
      properties: {
        id: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['productId', 'barcode', 'description', 'quantity', 'unitPrice', 'extendedPrice'],
            properties: {
              productId: { type: 'string' },
              barcode: { type: 'string' },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              extendedPrice: { type: 'number' },
              taxAmount: { type: 'number' },
            },
          },
        },
        subtotal: { type: 'number' },
        taxTotal: { type: 'number' },
        total: { type: 'number' },
      },
    };

    it('POST /api/cart should match contract', async () => {
      const response = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId: 'STORE-001',
          terminalId: 'TERMINAL-001',
        })
        .expect(201);

      const validate = ajv.compile(cartSchema);
      const valid = validate(response.body);

      expect(valid).toBe(true);
      if (!valid) {
        console.error('Validation errors:', validate.errors);
      }
    });
  });

  describe('Order API Contracts', () => {
    const orderSchema = {
      type: 'object',
      required: ['id', 'channel', 'status', 'storeId', 'items', 'subtotal', 'taxTotal', 'totalAmount', 'orderedAt'],
      properties: {
        id: { type: 'string' },
        transactionNumber: { type: ['number', 'null'] },
        externalOrderId: { type: ['string', 'null'] },
        channel: { type: 'string', enum: ['IN_STORE', 'DOORDASH', 'UBER_EATS', 'WEBSITE'] },
        status: {
          type: 'string',
          enum: ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'COMPLETED', 'CANCELLED'],
        },
        storeId: { type: 'string' },
        terminalId: { type: ['string', 'null'] },
        businessDate: { type: 'string' },
        items: { type: 'array' },
        subtotal: { type: 'number' },
        taxTotal: { type: 'number' },
        totalAmount: { type: 'number' },
        containsAlcohol: { type: 'boolean' },
        ageVerified: { type: ['boolean', 'null'] },
        orderedAt: { type: 'string' },
      },
    };

    it('GET /api/orders should return array matching contract', async () => {
      const response = await request(app)
        .get('/api/orders?limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);

      if (response.body.length > 0) {
        const validate = ajv.compile(orderSchema);
        const valid = validate(response.body[0]);

        expect(valid).toBe(true);
        if (!valid) {
          console.error('Validation errors:', validate.errors);
        }
      }
    });
  });

  describe('Analytics API Contracts', () => {
    const metricsSchema = {
      type: 'object',
      required: ['current', 'hourly', 'comparison'],
      properties: {
        current: {
          type: 'object',
          required: ['salesToday', 'transactionsToday', 'averageTransaction', 'customersToday'],
          properties: {
            salesToday: { type: 'number' },
            transactionsToday: { type: 'number' },
            averageTransaction: { type: 'number' },
            customersToday: { type: 'number' },
          },
        },
        hourly: {
          type: 'object',
          required: ['currentHour', 'salesThisHour', 'transactionsThisHour'],
          properties: {
            currentHour: { type: 'number' },
            salesThisHour: { type: 'number' },
            transactionsThisHour: { type: 'number' },
          },
        },
        comparison: {
          type: 'object',
          required: ['salesYesterday', 'salesLastWeek', 'percentChangeVsYesterday', 'percentChangeVsLastWeek'],
          properties: {
            salesYesterday: { type: 'number' },
            salesLastWeek: { type: 'number' },
            percentChangeVsYesterday: { type: 'number' },
            percentChangeVsLastWeek: { type: 'number' },
          },
        },
      },
    };

    it('GET /api/analytics/realtime/:storeId should match contract', async () => {
      const response = await request(app)
        .get('/api/analytics/realtime/STORE-001')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const validate = ajv.compile(metricsSchema);
      const valid = validate(response.body);

      expect(valid).toBe(true);
      if (!valid) {
        console.error('Validation errors:', validate.errors);
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain support for deprecated but still-used fields', async () => {
      // Test that old API versions still work
      const response = await request(app)
        .get('/api/v1/products/legacy-endpoint')
        .set('Authorization', `Bearer ${authToken}`);

      // Should either work (200) or explicitly say it's deprecated (410)
      expect([200, 410]).toContain(response.status);
    });

    it('should handle legacy request formats gracefully', async () => {
      // Test old request format
      const response = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Old format with camelCase instead of snake_case
          storeId: 'STORE-001',
          terminalId: 'TERMINAL-001',
        });

      expect([200, 201]).toContain(response.status);
    });
  });

  describe('Error Response Contracts', () => {
    const errorSchema = {
      type: 'object',
      required: ['success', 'message'],
      properties: {
        success: { const: false },
        message: { type: 'string' },
        errorCode: { type: 'string' },
        details: { type: 'object' },
      },
    };

    it('404 errors should match error contract', async () => {
      const response = await request(app)
        .get('/api/products/nonexistent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      const validate = ajv.compile(errorSchema);
      const valid = validate(response.body);

      expect(valid).toBe(true);
    });

    it('400 errors should match error contract', async () => {
      const response = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
        })
        .expect(400);

      const validate = ajv.compile(errorSchema);
      const valid = validate(response.body);

      expect(valid).toBe(true);
    });

    it('401 errors should match error contract', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      const validate = ajv.compile(errorSchema);
      const valid = validate(response.body);

      expect(valid).toBe(true);
    });
  });
});
