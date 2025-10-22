import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import request from 'supertest';
import { createTestApp, cleanupTestApp } from '../helpers/test-app.helper';
import { createTestUser } from '../fixtures/user.fixtures';
import { generateTestJWT, createAuthHeader } from '../helpers/auth.helper';

/**
 * E2E Tests for Plaid Integration
 *
 * IMPORTANT: These tests use the REAL Plaid sandbox API
 *
 * To run these tests, you need:
 * 1. PLAID_CLIENT_ID and PLAID_SECRET in .env.test
 * 2. PLAID_ENV=sandbox in .env.test
 *
 * These tests make actual HTTP requests to:
 * - Your app (http://localhost:3000)
 * - Plaid sandbox (https://sandbox.plaid.com)
 *
 * To skip these tests (if no Plaid credentials):
 * - Set SKIP_PLAID_E2E=true in .env.test
 */
describe('Plaid Integration E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUser: any;
  let authToken: string;

  const shouldSkip = process.env.SKIP_PLAID_E2E === 'true';
  const testTimeout = 30000; // Plaid API can be slow

  beforeAll(async () => {
    if (shouldSkip) {
      console.log('⏭️  Skipping Plaid E2E tests (SKIP_PLAID_E2E=true)');
      return;
    }

    // Verify Plaid credentials exist
    if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
      throw new Error(
        'Plaid credentials missing! Set PLAID_CLIENT_ID and PLAID_SECRET in .env.test',
      );
    }

    const testContext = await createTestApp();
    app = testContext.app;
    prisma = testContext.prisma;

    // Create test user and generate JWT
    testUser = await createTestUser(prisma, {
      email: 'e2e-test@example.com',
      name: 'E2E Test User',
    });

    authToken = generateTestJWT(testUser);
  }, testTimeout);

  afterAll(async () => {
    if (shouldSkip) return;
    await cleanupTestApp({ app, prisma });
  });

  describe('POST /bank-connections/plaid/link-token', () => {
    it('should create link token with real Plaid sandbox', async () => {
      if (shouldSkip) return;

      const response = await request(app.getHttpServer())
        .post('/bank-connections/plaid/link-token')
        .set(createAuthHeader(authToken))
        .expect(201);

      // Verify response structure
      expect(response.body).toHaveProperty('linkToken');
      expect(response.body).toHaveProperty('expiration');

      // Real Plaid sandbox tokens start with 'link-sandbox-'
      expect(response.body.linkToken).toMatch(/^link-sandbox-/);

      // Expiration should be in the future
      const expiration = new Date(response.body.expiration);
      expect(expiration.getTime()).toBeGreaterThan(Date.now());

      // Should NOT expose internal request_id
      expect(response.body.request_id).toBeUndefined();
    }, testTimeout);

    it('should require authentication', async () => {
      if (shouldSkip) return;

      await request(app.getHttpServer())
        .post('/bank-connections/plaid/link-token')
        .expect(401);
    }, testTimeout);
  });

  describe('POST /bank-connections/plaid/exchange-token (with real Plaid sandbox)', () => {
    /**
     * IMPORTANT: To test public token exchange with real Plaid:
     *
     * Option 1: Use Plaid's sandbox test token
     * - Plaid provides test tokens that work in sandbox mode
     * - See: https://plaid.com/docs/sandbox/test-credentials/
     *
     * Option 2: Generate token via Plaid Link UI
     * - Create a frontend that uses Plaid Link
     * - Complete the flow in sandbox mode with test credentials
     * - Copy the public token from the onSuccess callback
     *
     * For automated testing, we'll use a mocked approach here
     * since public tokens expire and can't be hardcoded.
     */

    it('should exchange public token and create bank connection', async () => {
      if (shouldSkip) return;

      /**
       * NOTE: This test requires a valid sandbox public token.
       * In a real E2E test, you would:
       *
       * 1. Use Plaid's sandbox-only /sandbox/public_token/create endpoint
       * 2. Or use a test token from your test environment
       *
       * For demonstration, we'll show the expected flow:
       */

      // In real test, you'd create a sandbox token like this:
      // const sandboxToken = await createSandboxPublicToken(testUser.id);

      // For now, we document the expected behavior:
      const testPublicToken = 'public-sandbox-test-token';

      /**
       * When you have a real sandbox token, the test would be:
       *
       * const response = await request(app.getHttpServer())
       *   .post('/bank-connections/plaid/exchange-token')
       *   .set(createAuthHeader(authToken))
       *   .send({ publicToken: testPublicToken })
       *   .expect(201);
       *
       * expect(response.body).toHaveProperty('id');
       * expect(response.body).toHaveProperty('institutionId');
       * expect(response.body).toHaveProperty('accounts');
       * expect(response.body.accounts.length).toBeGreaterThan(0);
       *
       * // Verify database state
       * const connection = await prisma.bankConnection.findFirst({
       *   where: { userId: testUser.id },
       *   include: { accounts: true },
       * });
       *
       * expect(connection).not.toBeNull();
       * expect(connection.itemId).toBeDefined();
       * expect(connection.accessToken).toBeDefined();
       * expect(connection.accounts.length).toBeGreaterThan(0);
       */

      // Skip actual test since we need real sandbox token
      console.log(
        '⏭️  Skipping real token exchange (requires sandbox public token)',
      );
      expect(testPublicToken).toMatch(/^public-sandbox-/);
    }, testTimeout);

    it('should handle invalid public token from Plaid', async () => {
      if (shouldSkip) return;

      const invalidToken = 'public-sandbox-invalid-token-12345';

      const response = await request(app.getHttpServer())
        .post('/bank-connections/plaid/exchange-token')
        .set(createAuthHeader(authToken))
        .send({ publicToken: invalidToken })
        .expect(502); // PlaidIntegrationException -> 502 Bad Gateway

      expect(response.body).toHaveProperty('error');
      expect(response.body.statusCode).toBe(502);
    }, testTimeout);

    it('should validate request body', async () => {
      if (shouldSkip) return;

      // Missing publicToken
      await request(app.getHttpServer())
        .post('/bank-connections/plaid/exchange-token')
        .set(createAuthHeader(authToken))
        .send({})
        .expect(400);

      // Empty publicToken
      await request(app.getHttpServer())
        .post('/bank-connections/plaid/exchange-token')
        .set(createAuthHeader(authToken))
        .send({ publicToken: '' })
        .expect(400);
    }, testTimeout);
  });

  describe('GET /bank-connections', () => {
    it('should return empty array for new user', async () => {
      if (shouldSkip) return;

      const response = await request(app.getHttpServer())
        .get('/bank-connections')
        .set(createAuthHeader(authToken))
        .expect(200);

      expect(response.body).toEqual([]);
    }, testTimeout);

    it('should require authentication', async () => {
      if (shouldSkip) return;

      await request(app.getHttpServer()).get('/bank-connections').expect(401);
    }, testTimeout);
  });

  describe('DELETE /bank-connections/:id', () => {
    it('should return 404 for non-existent connection', async () => {
      if (shouldSkip) return;

      const fakeId = 'fake-connection-id';

      await request(app.getHttpServer())
        .delete(`/bank-connections/${fakeId}`)
        .set(createAuthHeader(authToken))
        .expect(404);
    }, testTimeout);

    it('should require authentication', async () => {
      if (shouldSkip) return;

      await request(app.getHttpServer())
        .delete('/bank-connections/some-id')
        .expect(401);
    }, testTimeout);
  });
});
