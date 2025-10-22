import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import request from 'supertest';
import { createTestApp, cleanupTestApp } from '../helpers/test-app.helper';
import { createTestUser } from '../fixtures/user.fixtures';
import { generateTestJWT, createAuthHeader } from '../helpers/auth.helper';

/**
 * E2E Tests for Investment Flow (Seccl Integration)
 *
 * Tests the complete investment flow:
 * 1. Create Seccl investment account
 * 2. Create investment order (payment + order)
 * 3. View positions
 */
describe('Investment Flow E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUser: any;
  let authToken: string;

  const testTimeout = 30000;

  beforeAll(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    prisma = testContext.prisma;

    // Create test user and generate JWT
    testUser = await createTestUser(prisma, {
      email: 'e2e-investment@example.com',
      name: 'Investment Test User',
    });

    authToken = generateTestJWT(testUser);
  }, testTimeout);

  afterAll(async () => {
    await cleanupTestApp({ app, prisma });
  });

  describe('POST /investments/accounts', () => {
    it('should create Seccl investment account', async () => {
      const response = await request(app.getHttpServer())
        .post('/investments/accounts')
        .set(createAuthHeader(authToken))
        .send({
          accountName: 'E2E Test ISA',
          wrapperType: 'ISA',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('secclAccountId');
      expect(response.body.accountName).toBe('E2E Test ISA');
      expect(response.body.wrapperType).toBe('ISA');
      expect(response.body.currency).toBe('GBP');
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/investments/accounts')
        .send({
          accountName: 'Unauthorized Account',
          wrapperType: 'GIA',
        })
        .expect(401);
    });

    it('should validate request body', async () => {
      await request(app.getHttpServer())
        .post('/investments/accounts')
        .set(createAuthHeader(authToken))
        .send({
          // Missing accountName
          wrapperType: 'ISA',
        })
        .expect(400);
    });
  });

  describe('GET /investments/accounts', () => {
    it('should return all investment accounts for user', async () => {
      // Create account first
      const createResponse = await request(app.getHttpServer())
        .post('/investments/accounts')
        .set(createAuthHeader(authToken))
        .send({
          accountName: 'Test GIA',
          wrapperType: 'GIA',
        })
        .expect(201);

      // Get all accounts
      const response = await request(app.getHttpServer())
        .get('/investments/accounts')
        .set(createAuthHeader(authToken))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const account = response.body.find(
        (acc: any) => acc.id === createResponse.body.id,
      );
      expect(account).toBeDefined();
      expect(account.accountName).toBe('Test GIA');
    });
  });

  describe('POST /investments/orders (Complete Investment Flow)', () => {
    let secclAccountId: string;

    beforeAll(async () => {
      // Create account for orders
      const response = await request(app.getHttpServer())
        .post('/investments/accounts')
        .set(createAuthHeader(authToken))
        .send({
          accountName: 'Test Order Account',
          wrapperType: 'GIA',
        });

      secclAccountId = response.body.id;
    });

    it('should create and execute investment order', async () => {
      const idempotencyKey = `test-order-${Date.now()}`;

      const response = await request(app.getHttpServer())
        .post('/investments/orders')
        .set(createAuthHeader(authToken))
        .set('Idempotency-Key', idempotencyKey)
        .send({
          secclAccountId,
          amount: 10000, // £100.00
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('ORDER_COMPLETED');
      expect(response.body.fundId).toBe('275F1');
      expect(response.body.fundName).toBe('Money Market Fund');
      expect(response.body.executedQuantity).toBeGreaterThan(0);
      expect(response.body.executionPrice).toBe(2.27);
    });

    it('should be idempotent (same key returns same order)', async () => {
      const idempotencyKey = `test-idempotent-${Date.now()}`;

      // First request
      const firstResponse = await request(app.getHttpServer())
        .post('/investments/orders')
        .set(createAuthHeader(authToken))
        .set('Idempotency-Key', idempotencyKey)
        .send({
          secclAccountId,
          amount: 5000,
        })
        .expect(201);

      // Second request with same key
      const secondResponse = await request(app.getHttpServer())
        .post('/investments/orders')
        .set(createAuthHeader(authToken))
        .set('Idempotency-Key', idempotencyKey)
        .send({
          secclAccountId,
          amount: 5000,
        })
        .expect(201);

      expect(firstResponse.body.id).toBe(secondResponse.body.id);
    });

    it('should require Idempotency-Key header', async () => {
      const response = await request(app.getHttpServer())
        .post('/investments/orders')
        .set(createAuthHeader(authToken))
        // No Idempotency-Key header
        .send({
          secclAccountId,
          amount: 5000,
        })
        .expect(400);

      expect(response.body.message).toContain('Idempotency-Key');
    });

    it('should validate minimum amount', async () => {
      await request(app.getHttpServer())
        .post('/investments/orders')
        .set(createAuthHeader(authToken))
        .set('Idempotency-Key', `test-min-${Date.now()}`)
        .send({
          secclAccountId,
          amount: 50, // Less than minimum £1.00 (100 pence)
        })
        .expect(400);
    });

    it('should reject invalid account ID', async () => {
      await request(app.getHttpServer())
        .post('/investments/orders')
        .set(createAuthHeader(authToken))
        .set('Idempotency-Key', `test-invalid-${Date.now()}`)
        .send({
          secclAccountId: 'non-existent-account-id',
          amount: 5000,
        })
        .expect(404);
    });
  });

  describe('GET /investments/positions', () => {
    it('should return positions after order execution', async () => {
      // Create account
      const accountResponse = await request(app.getHttpServer())
        .post('/investments/accounts')
        .set(createAuthHeader(authToken))
        .send({
          accountName: 'Position Test Account',
          wrapperType: 'ISA',
        });

      const accountId = accountResponse.body.id;

      // Create order
      await request(app.getHttpServer())
        .post('/investments/orders')
        .set(createAuthHeader(authToken))
        .set('Idempotency-Key', `test-position-${Date.now()}`)
        .send({
          secclAccountId: accountId,
          amount: 10000,
        });

      // Get positions
      const response = await request(app.getHttpServer())
        .get(`/investments/positions?secclAccountId=${accountId}`)
        .set(createAuthHeader(authToken))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const position = response.body[0];
      expect(position.fundId).toBe('275F1');
      expect(position.fundName).toBe('Money Market Fund');
      expect(position.quantity).toBeGreaterThan(0);
      expect(position.bookValue).toBeGreaterThan(0);
    });
  });

  describe('GET /investments/accounts/:id/summary', () => {
    it('should return account summary with positions', async () => {
      // Create account
      const accountResponse = await request(app.getHttpServer())
        .post('/investments/accounts')
        .set(createAuthHeader(authToken))
        .send({
          accountName: 'Summary Test Account',
          wrapperType: 'GIA',
        });

      const accountId = accountResponse.body.id;

      // Create order
      await request(app.getHttpServer())
        .post('/investments/orders')
        .set(createAuthHeader(authToken))
        .set('Idempotency-Key', `test-summary-${Date.now()}`)
        .send({
          secclAccountId: accountId,
          amount: 10000,
        });

      // Get summary
      const response = await request(app.getHttpServer())
        .get(`/investments/accounts/${accountId}/summary`)
        .set(createAuthHeader(authToken))
        .expect(200);

      expect(response.body.accountId).toBeDefined();
      expect(response.body.accountName).toBe('Summary Test Account');
      expect(response.body.wrapperType).toBe('GIA');
      expect(response.body.positions).toBeDefined();
      expect(Array.isArray(response.body.positions)).toBe(true);
      expect(response.body.positions.length).toBeGreaterThan(0);
    });
  });
});
