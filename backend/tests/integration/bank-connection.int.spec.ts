import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { LoggerModule } from '../../src/common/logging/logger.module';
import { EncryptionModule } from '../../src/common/encryption/encryption.module';
import { BankConnectionService } from '../../src/bank-connection/bank-connection.service';
import { BankConnectionRepository } from '../../src/bank-connection/bank-connection.repository';
import { PlaidService } from '../../src/plaid/plaid.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { createTestUser } from '../fixtures/user.fixtures';
import {
  createMockTokenExchangeResponse,
  createMockAccountsResponse,
} from '../fixtures/plaid.fixtures';
import { cleanDatabase } from '../helpers/test-app.helper';

/**
 * Integration Tests for BankConnectionService
 * - Uses real Prisma/PostgreSQL database
 * - Mocks external Plaid API calls
 * - Tests database operations, transactions, rollbacks
 */
describe('BankConnectionService Integration', () => {
  let service: BankConnectionService;
  let repository: BankConnectionRepository;
  let prisma: PrismaService;
  let mockPlaidService: jest.Mocked<PlaidService>;
  let testUser1: any;
  let testUser2: any;

  beforeAll(async () => {
    // Create test module with required modules
    // Mock PlaidService to avoid external API calls
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        PrismaModule,
        LoggerModule,
        EncryptionModule,
      ],
      providers: [
        BankConnectionService,
        BankConnectionRepository,
        {
          provide: PlaidService,
          useValue: {
            exchangePublicToken: jest.fn(),
            getAccounts: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BankConnectionService>(BankConnectionService);
    repository = module.get<BankConnectionRepository>(BankConnectionRepository);
    prisma = module.get<PrismaService>(PrismaService);
    mockPlaidService = module.get(PlaidService);
  });

  beforeEach(async () => {
    // Clean database before each test
    if (prisma) {
      await cleanDatabase(prisma);
    }

    // Create test users
    testUser1 = await createTestUser(prisma, {
      email: 'user1@test.com',
      name: 'User 1',
    });

    testUser2 = await createTestUser(prisma, {
      email: 'user2@test.com',
      name: 'User 2',
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('exchangePublicToken (integration)', () => {
    it('should create connection with accounts in database', async () => {
      const publicToken = 'public-test-token';
      const plaidResponse = createMockTokenExchangeResponse({
        itemId: 'item-integration-test-1',
      });
      const accountsResponse = createMockAccountsResponse({ accountCount: 2 });

      mockPlaidService.exchangePublicToken.mockResolvedValue(plaidResponse);
      mockPlaidService.getAccounts.mockResolvedValue(accountsResponse);

      // Execute service method
      const result = await service.exchangePublicToken(
        testUser1.id,
        publicToken,
      );

      // Verify response
      expect(result.id).toBeDefined();
      expect(result.institutionId).toBe(accountsResponse.item.institution_id);
      expect(result.accounts).toHaveLength(2);

      // CRITICAL: Verify database state
      const dbConnection = await prisma.bankConnection.findUnique({
        where: { id: result.id },
        include: { accounts: true },
      });

      expect(dbConnection).not.toBeNull();
      expect(dbConnection!.userId).toBe(testUser1.id);
      expect(dbConnection!.itemId).toBe(plaidResponse.item_id);
      expect(dbConnection!.accessToken).toBeDefined(); // Encrypted
      expect(dbConnection!.accessToken).not.toBe(plaidResponse.access_token); // Should be encrypted
      expect(dbConnection!.status).toBe('ACTIVE');
      expect(dbConnection!.accounts).toHaveLength(2);

      // Verify balances stored in cents
      const firstAccount = dbConnection!.accounts[0];
      expect(firstAccount.currentBalance).toBe(11000); // $110 * 100
      expect(firstAccount.availableBalance).toBe(10000); // $100 * 100
    });

    it('should enforce idempotency (same itemId returns existing connection)', async () => {
      const publicToken = 'public-test-token';
      const plaidResponse = createMockTokenExchangeResponse({
        itemId: 'item-idempotent-test',
      });
      const accountsResponse = createMockAccountsResponse({ accountCount: 1 });

      mockPlaidService.exchangePublicToken.mockResolvedValue(plaidResponse);
      mockPlaidService.getAccounts.mockResolvedValue(accountsResponse);

      // First call: creates connection
      const result1 = await service.exchangePublicToken(
        testUser1.id,
        publicToken,
      );

      // Second call: should return same connection
      const result2 = await service.exchangePublicToken(
        testUser1.id,
        publicToken,
      );

      // CRITICAL: Should return same connection ID
      expect(result1.id).toBe(result2.id);

      // Verify only ONE connection in database
      const connections = await prisma.bankConnection.findMany({
        where: { userId: testUser1.id },
      });
      expect(connections).toHaveLength(1);

      // Plaid getAccounts should only be called once (not on idempotent call)
      expect(mockPlaidService.getAccounts).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if itemId belongs to different user', async () => {
      const publicToken = 'public-test-token';
      const plaidResponse = createMockTokenExchangeResponse({
        itemId: 'item-cross-user-test',
      });
      const accountsResponse = createMockAccountsResponse();

      mockPlaidService.exchangePublicToken.mockResolvedValue(plaidResponse);
      mockPlaidService.getAccounts.mockResolvedValue(accountsResponse);

      // User 1 creates connection
      await service.exchangePublicToken(testUser1.id, publicToken);

      // User 2 tries to connect same bank account
      await expect(
        service.exchangePublicToken(testUser2.id, publicToken),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.exchangePublicToken(testUser2.id, publicToken),
      ).rejects.toThrow('already connected to another user');

      // Verify only user1 has the connection
      const user1Connections = await prisma.bankConnection.findMany({
        where: { userId: testUser1.id },
      });
      const user2Connections = await prisma.bankConnection.findMany({
        where: { userId: testUser2.id },
      });

      expect(user1Connections).toHaveLength(1);
      expect(user2Connections).toHaveLength(0);
    });

    it('should rollback transaction if account fetch fails', async () => {
      const publicToken = 'public-test-token';
      const plaidResponse = createMockTokenExchangeResponse({
        itemId: 'item-rollback-test',
      });

      mockPlaidService.exchangePublicToken.mockResolvedValue(plaidResponse);
      mockPlaidService.getAccounts.mockRejectedValue(
        new Error('Plaid API timeout'),
      );

      // Should fail
      await expect(
        service.exchangePublicToken(testUser1.id, publicToken),
      ).rejects.toThrow('Plaid API timeout');

      // CRITICAL: Verify NO connection was created (transaction rolled back)
      const connections = await prisma.bankConnection.findMany({
        where: { userId: testUser1.id },
      });
      expect(connections).toHaveLength(0);
    });
  });

  describe('findByUserId (integration)', () => {
    it('should return only connections for specified user', async () => {
      // Create connections for user1
      const plaidResponse1 = createMockTokenExchangeResponse({
        itemId: 'item-user1-conn1',
      });
      const plaidResponse2 = createMockTokenExchangeResponse({
        itemId: 'item-user1-conn2',
      });
      const accountsResponse = createMockAccountsResponse();

      mockPlaidService.exchangePublicToken
        .mockResolvedValueOnce(plaidResponse1)
        .mockResolvedValueOnce(plaidResponse2);
      mockPlaidService.getAccounts.mockResolvedValue(accountsResponse);

      await service.exchangePublicToken(testUser1.id, 'token1');
      await service.exchangePublicToken(testUser1.id, 'token2');

      // Create connection for user2
      const plaidResponse3 = createMockTokenExchangeResponse({
        itemId: 'item-user2-conn1',
      });
      mockPlaidService.exchangePublicToken.mockResolvedValueOnce(
        plaidResponse3,
      );
      await service.exchangePublicToken(testUser2.id, 'token3');

      // Fetch user1's connections
      const user1Connections = await service.findByUserId(testUser1.id);

      // CRITICAL: Should only return user1's connections
      expect(user1Connections).toHaveLength(2);
      expect(user1Connections.every((c) => c.userId === testUser1.id)).toBe(
        true,
      );
    });

    it('should not return soft-deleted connections', async () => {
      const plaidResponse = createMockTokenExchangeResponse();
      const accountsResponse = createMockAccountsResponse();

      mockPlaidService.exchangePublicToken.mockResolvedValue(plaidResponse);
      mockPlaidService.getAccounts.mockResolvedValue(accountsResponse);

      const connection = await service.exchangePublicToken(
        testUser1.id,
        'token',
      );

      // Soft delete the connection
      await service.delete(testUser1.id, connection.id);

      // Verify not returned in list
      const connections = await service.findByUserId(testUser1.id);
      expect(connections).toHaveLength(0);

      // Verify still exists in database (soft delete)
      const dbConnection = await prisma.bankConnection.findUnique({
        where: { id: connection.id },
      });
      expect(dbConnection).not.toBeNull();
      expect(dbConnection!.deletedAt).not.toBeNull();
    });
  });

  describe('delete (integration)', () => {
    it('should soft delete connection and prevent unauthorized access', async () => {
      const plaidResponse = createMockTokenExchangeResponse();
      const accountsResponse = createMockAccountsResponse();

      mockPlaidService.exchangePublicToken.mockResolvedValue(plaidResponse);
      mockPlaidService.getAccounts.mockResolvedValue(accountsResponse);

      const connection = await service.exchangePublicToken(
        testUser1.id,
        'token',
      );

      // User1 deletes their own connection
      await service.delete(testUser1.id, connection.id);

      // Verify soft deleted
      const dbConnection = await prisma.bankConnection.findUnique({
        where: { id: connection.id },
      });
      expect(dbConnection!.deletedAt).not.toBeNull();
      expect(dbConnection!.status).toBe('DISCONNECTED');

      // Verify user1 can no longer access it
      await expect(
        service.findById(testUser1.id, connection.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent cross-user deletion', async () => {
      const plaidResponse = createMockTokenExchangeResponse();
      const accountsResponse = createMockAccountsResponse();

      mockPlaidService.exchangePublicToken.mockResolvedValue(plaidResponse);
      mockPlaidService.getAccounts.mockResolvedValue(accountsResponse);

      const connection = await service.exchangePublicToken(
        testUser1.id,
        'token',
      );

      // User2 tries to delete user1's connection
      await expect(
        service.delete(testUser2.id, connection.id),
      ).rejects.toThrow();

      // Verify connection still exists and not deleted
      const dbConnection = await prisma.bankConnection.findUnique({
        where: { id: connection.id },
      });
      expect(dbConnection!.deletedAt).toBeNull();
    });
  });
});
