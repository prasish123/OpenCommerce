/**
 * Integration Tests - Authentication Flow
 * Test complete authentication flow end-to-end
 */

import request from 'supertest';
import { app } from '../../src/server';
import { db } from '../../src/shared/database';

describe('Authentication Flow', () => {
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    // Create test user
    const result = await db.query(
      `INSERT INTO auth_service.users (
        id, username, full_name, email, role, pin_hash, password_hash, is_active
      ) VALUES (
        gen_random_uuid(), 'test_cashier', 'Test Cashier', 'test@test.com', 'CASHIER',
        crypt('1234', gen_salt('bf')), crypt('password123', gen_salt('bf')), true
      ) RETURNING id`
    );
    testUserId = result.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await db.query(`DELETE FROM auth_service.users WHERE id = $1`, [testUserId]);
    await db.end();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test_cashier',
          password: 'password123',
          terminalId: 'TERMINAL-TEST',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe('test_cashier');
      expect(response.body.user.role).toBe('CASHIER');
      expect(response.body.token).toBeDefined();
      expect(response.body.sessionId).toBeDefined();

      authToken = response.body.token;
    });

    it('should fail with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test_cashier',
          password: 'wrongpassword',
          terminalId: 'TERMINAL-TEST',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });

    it('should fail with non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123',
          terminalId: 'TERMINAL-TEST',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login-pin', () => {
    it('should login with valid PIN', async () => {
      const response = await request(app)
        .post('/api/auth/login-pin')
        .send({
          pinCode: '1234',
          terminalId: 'TERMINAL-TEST',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe('test_cashier');
      expect(response.body.token).toBeDefined();
    });

    it('should fail with invalid PIN', async () => {
      const response = await request(app)
        .post('/api/auth/login-pin')
        .send({
          pinCode: '9999',
          terminalId: 'TERMINAL-TEST',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.username).toBe('test_cashier');
      expect(response.body.role).toBe('CASHIER');
    });

    it('should fail without token', async () => {
      await request(app).get('/api/auth/me').expect(401);
    });

    it('should fail with invalid token', async () => {
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('should fail to access protected routes after logout', async () => {
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);
    });
  });
});
