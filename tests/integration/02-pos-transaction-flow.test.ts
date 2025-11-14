/**
 * Integration Tests - Complete POS Transaction Flow
 * Test entire checkout flow from cart creation to payment
 */

import request from 'supertest';
import { app } from '../../src/server';
import { db } from '../../src/shared/database';

describe('POS Transaction Flow', () => {
  let authToken: string;
  let userId: string;
  let productId: string;
  let cartId: string;
  let transactionId: string;

  beforeAll(async () => {
    // Create test user
    const userResult = await db.query(
      `INSERT INTO auth_service.users (
        id, username, full_name, role, password_hash, is_active
      ) VALUES (
        gen_random_uuid(), 'test_cashier_pos', 'Test Cashier POS', 'CASHIER',
        crypt('password123', gen_salt('bf')), true
      ) RETURNING id`
    );
    userId = userResult.rows[0].id;

    // Login
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'test_cashier_pos',
        password: 'password123',
        terminalId: 'TERMINAL-001',
      });
    authToken = loginResponse.body.token;

    // Create test product
    const productResult = await db.query(
      `INSERT INTO product_service.products (
        id, barcode, barcode_type, description, base_price, merchandise_code,
        tax_strategy_id, active, requires_age_verification, category
      ) VALUES (
        gen_random_uuid(), '1234567890123', 'UPC-A', 'Test Beer 6-Pack', 12.99,
        'BEER', 1, true, true, 'BEER'
      ) RETURNING id`
    );
    productId = productResult.rows[0].id;

    // Add inventory
    await db.query(
      `INSERT INTO inventory_service.inventory (
        id, product_id, store_id, quantity_on_hand, reorder_point, reorder_quantity
      ) VALUES (
        gen_random_uuid(), $1, 'STORE-001', 100, 10, 50
      )`,
      [productId]
    );
  });

  afterAll(async () => {
    // Cleanup
    await db.query(`DELETE FROM order_service.retail_transactions WHERE id = $1`, [transactionId]);
    await db.query(`DELETE FROM inventory_service.inventory WHERE product_id = $1`, [productId]);
    await db.query(`DELETE FROM product_service.products WHERE id = $1`, [productId]);
    await db.query(`DELETE FROM auth_service.users WHERE id = $1`, [userId]);
    await db.end();
  });

  describe('Complete Transaction Flow', () => {
    it('Step 1: Create new cart', async () => {
      const response = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId: 'STORE-001',
          terminalId: 'TERMINAL-001',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.items).toEqual([]);
      expect(response.body.subtotal).toBe(0);
      expect(response.body.total).toBe(0);

      cartId = response.body.id;
    });

    it('Step 2: Scan and add item to cart', async () => {
      const response = await request(app)
        .post(`/api/cart/${cartId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          barcode: '1234567890123',
          quantity: 2,
        })
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].barcode).toBe('1234567890123');
      expect(response.body.items[0].quantity).toBe(2);
      expect(response.body.items[0].unitPrice).toBe(12.99);
      expect(response.body.items[0].extendedPrice).toBe(25.98);
      expect(response.body.subtotal).toBe(25.98);
      expect(response.body.total).toBeGreaterThan(25.98); // Should include tax
    });

    it('Step 3: Add loyalty member lookup', async () => {
      // Create test loyalty member
      await db.query(
        `INSERT INTO loyalty_service.members (
          id, member_number, first_name, last_name, phone, tier, points_balance
        ) VALUES (
          gen_random_uuid(), 'LR12345678', 'John', 'Doe', '+15551234567', 'GOLD', 500
        )`
      );

      const response = await request(app)
        .get('/api/loyalty/lookup/+15551234567')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.memberNumber).toBe('LR12345678');
      expect(response.body.tier).toBe('GOLD');
      expect(response.body.pointsBalance).toBe(500);
    });

    it('Step 4: Apply age verification', async () => {
      const response = await request(app)
        .post(`/api/cart/${cartId}/verify-age`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          verificationMethod: 'MANUAL_ID_CHECK',
          driverLicenseState: 'CA',
          driverDob: '1990-01-01',
        })
        .expect(200);

      expect(response.body.ageVerified).toBe(true);
    });

    it('Step 5: Checkout with payment', async () => {
      const response = await request(app)
        .post(`/api/cart/${cartId}/checkout`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tenders: [
            {
              tenderType: 'CASH',
              amount: 30.0,
            },
          ],
          customerPhone: '+15551234567',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transactionId).toBeDefined();
      expect(response.body.changeDue).toBeGreaterThan(0);

      transactionId = response.body.transactionId;
    });

    it('Step 6: Verify transaction created', async () => {
      const result = await db.query(
        `SELECT * FROM order_service.retail_transactions WHERE id = $1`,
        [transactionId]
      );

      expect(result.rows).toHaveLength(1);
      const transaction = result.rows[0];
      expect(transaction.status).toBe('COMPLETED');
      expect(transaction.store_id).toBe('STORE-001');
      expect(transaction.terminal_id).toBe('TERMINAL-001');
      expect(parseFloat(transaction.total_amount)).toBeGreaterThan(25.98);
    });

    it('Step 7: Verify inventory decremented', async () => {
      const result = await db.query(
        `SELECT quantity_on_hand FROM inventory_service.inventory
         WHERE product_id = $1 AND store_id = 'STORE-001'`,
        [productId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].quantity_on_hand).toBe(98); // 100 - 2
    });

    it('Step 8: Verify stock movement logged', async () => {
      const result = await db.query(
        `SELECT * FROM inventory_service.stock_movements
         WHERE reference_id = $1 AND movement_type = 'SALE'`,
        [transactionId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].quantity).toBe(-2); // Negative for sale
    });

    it('Step 9: Verify loyalty points awarded', async () => {
      const result = await db.query(
        `SELECT * FROM loyalty_service.points_transactions
         WHERE order_id = $1 AND transaction_type = 'EARNED'`,
        [transactionId]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(parseInt(result.rows[0].points)).toBeGreaterThan(0); // Should earn points
    });
  });

  describe('Error Handling', () => {
    it('should prevent checkout with insufficient inventory', async () => {
      // Create cart
      const cartResponse = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId: 'STORE-001',
          terminalId: 'TERMINAL-001',
        });
      const testCartId = cartResponse.body.id;

      // Try to add 200 items (more than available)
      const response = await request(app)
        .post(`/api/cart/${testCartId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          barcode: '1234567890123',
          quantity: 200,
        })
        .expect(400);

      expect(response.body.message).toContain('Insufficient inventory');
    });

    it('should prevent checkout without age verification for alcohol', async () => {
      // Create cart
      const cartResponse = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId: 'STORE-001',
          terminalId: 'TERMINAL-001',
        });
      const testCartId = cartResponse.body.id;

      // Add item
      await request(app)
        .post(`/api/cart/${testCartId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          barcode: '1234567890123',
          quantity: 1,
        });

      // Try to checkout without age verification
      const response = await request(app)
        .post(`/api/cart/${testCartId}/checkout`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tenders: [
            {
              tenderType: 'CASH',
              amount: 20.0,
            },
          ],
        })
        .expect(400);

      expect(response.body.message).toContain('Age verification required');
    });
  });
});
