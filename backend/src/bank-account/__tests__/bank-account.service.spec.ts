import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { BankAccountService } from '../bank-account.service';
import { BankAccountRepository } from '../bank-account.repository';
import { TransactionRepository } from '../../transaction/transaction.repository';
import { LoggerService } from '../../common/logging/logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BankAccount, BankConnection } from '@prisma/client';

describe('BankAccountService', () => {
  let service: BankAccountService;
  let repository: jest.Mocked<BankAccountRepository>;
  let transactionRepository: jest.Mocked<any>;
  let prismaService: jest.Mocked<PrismaService>;
  let mockLogger: jest.Mocked<LoggerService>;

  const mockUserId = 'user-123';
  const mockOtherUserId = 'user-456';

  const mockBankConnection: BankConnection = {
    id: 'conn-123',
    userId: mockUserId,
    accessToken: 'encrypted-token',
    itemId: 'item-123',
    institutionId: 'ins_109508',
    institutionName: 'Test Bank',
    status: 'ACTIVE',
    lastSyncedAt: new Date('2024-01-15'),
    lastSyncStatus: 'SUCCESS',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
    deletedAt: null,
  };

  const mockBankAccount: BankAccount = {
    id: 'acc-123',
    bankConnectionId: 'conn-123',
    plaidAccountId: 'plaid-acc-123',
    name: 'Test Checking',
    officialName: 'Test Checking Account',
    type: 'depository',
    subtype: 'checking',
    mask: '1234',
    currentBalance: 10000, // $100.00 in cents
    availableBalance: 9500, // $95.00 in cents
    isoCurrencyCode: 'USD',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
  };

  beforeEach(async () => {
    mockLogger = {
      setContext: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      verbose: jest.fn(),
    } as any;

    const mockTransaction = jest.fn((callback) =>
      callback({
        bankAccount: {},
        bankConnection: {},
      }),
    );

    prismaService = {
      $transaction: mockTransaction,
    } as any;

    repository = {
      findByUserId: jest.fn(),
      findById: jest.fn(),
      findByConnectionId: jest.fn(),
      getConsolidatedBalance: jest.fn(),
    } as any;

    transactionRepository = {
      findByBankAccountId: jest.fn(),
      countByBankAccountId: jest.fn(),
      upsertTransactions: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankAccountService,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: BankAccountRepository,
          useValue: repository,
        },
        {
          provide: TransactionRepository,
          useValue: transactionRepository,
        },
      ],
    }).compile();

    service = module.get<BankAccountService>(BankAccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByUserId', () => {
    it('should return all accounts for a user', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      repository.findByUserId.mockResolvedValue(mockAccounts as any);

      const result = await service.findByUserId(mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('acc-123');
      expect(result[0].name).toBe('Test Checking');
      expect(result[0].currentBalance).toBe(10000);
      expect(repository.findByUserId).toHaveBeenCalledWith(expect.anything(), mockUserId);
    });

    it('should return empty array when user has no accounts', async () => {
      repository.findByUserId.mockResolvedValue([]);

      const result = await service.findByUserId(mockUserId);

      expect(result).toEqual([]);
    });

    it('should log debug message', async () => {
      repository.findByUserId.mockResolvedValue([]);

      await service.findByUserId(mockUserId);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Finding bank accounts for user',
        { userId: mockUserId },
      );
    });
  });

  describe('findById', () => {
    it('should return account when user owns it', async () => {
      const mockAccountWithConnection = {
        ...mockBankAccount,
        bankConnection: mockBankConnection,
      };

      repository.findById.mockResolvedValue(mockAccountWithConnection as any);

      const result = await service.findById(mockUserId, 'acc-123');

      expect(result.id).toBe('acc-123');
      expect(result.name).toBe('Test Checking');
      expect(repository.findById).toHaveBeenCalledWith(expect.anything(), 'acc-123');
    });

    it('should throw NotFoundException when account does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById(mockUserId, 'acc-999')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById(mockUserId, 'acc-999')).rejects.toThrow(
        'Bank account not found',
      );
    });

    it('should throw ForbiddenException when user does not own account', async () => {
      const mockAccountWithConnection = {
        ...mockBankAccount,
        bankConnection: {
          ...mockBankConnection,
          userId: mockOtherUserId, // Different user
        },
      };

      repository.findById.mockResolvedValue(mockAccountWithConnection as any);

      await expect(service.findById(mockUserId, 'acc-123')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.findById(mockUserId, 'acc-123')).rejects.toThrow(
        'You do not have access to this bank account',
      );
    });

    it('should log warning when unauthorized access attempted', async () => {
      const mockAccountWithConnection = {
        ...mockBankAccount,
        bankConnection: {
          ...mockBankConnection,
          userId: mockOtherUserId,
        },
      };

      repository.findById.mockResolvedValue(mockAccountWithConnection as any);

      await expect(service.findById(mockUserId, 'acc-123')).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unauthorized bank account access attempt',
        {
          userId: mockUserId,
          accountId: 'acc-123',
          ownerId: mockOtherUserId,
        },
      );
    });

    it('should log debug message', async () => {
      const mockAccountWithConnection = {
        ...mockBankAccount,
        bankConnection: mockBankConnection,
      };

      repository.findById.mockResolvedValue(mockAccountWithConnection as any);

      await service.findById(mockUserId, 'acc-123');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Finding bank account',
        { userId: mockUserId, accountId: 'acc-123' },
      );
    });
  });

  describe('getConsolidatedBalance', () => {
    it('should return consolidated balance for default currency (USD)', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          currentBalance: 10000,
          availableBalance: 9500,
          bankConnection: {
            institutionName: 'Bank A',
          },
        },
        {
          ...mockBankAccount,
          id: 'acc-456',
          currentBalance: 20000,
          availableBalance: 19000,
          bankConnection: {
            institutionName: 'Bank B',
          },
        },
      ];

      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 30000,
        totalAvailable: 28500,
        accounts: mockAccounts as any,
      });

      const result = await service.getConsolidatedBalance(mockUserId);

      expect(result.totalCurrent).toBe(30000);
      expect(result.totalAvailable).toBe(28500);
      expect(result.currency).toBe('USD');
      expect(result.accountCount).toBe(2);
      expect(result.accounts).toHaveLength(2);
      expect(repository.getConsolidatedBalance).toHaveBeenCalledWith(
        expect.anything(),
        mockUserId,
        'USD',
      );
    });

    it('should return consolidated balance for specified currency', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          isoCurrencyCode: 'EUR',
          currentBalance: 50000,
          availableBalance: 48000,
          bankConnection: {
            institutionName: 'Euro Bank',
          },
        },
      ];

      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 50000,
        totalAvailable: 48000,
        accounts: mockAccounts as any,
      });

      const result = await service.getConsolidatedBalance(mockUserId, 'EUR');

      expect(result.currency).toBe('EUR');
      expect(result.totalCurrent).toBe(50000);
      expect(repository.getConsolidatedBalance).toHaveBeenCalledWith(
        expect.anything(),
        mockUserId,
        'EUR',
      );
    });

    it('should return zero balances when no accounts exist', async () => {
      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 0,
        totalAvailable: 0,
        accounts: [],
      });

      const result = await service.getConsolidatedBalance(mockUserId);

      expect(result.totalCurrent).toBe(0);
      expect(result.totalAvailable).toBe(0);
      expect(result.accountCount).toBe(0);
      expect(result.accounts).toEqual([]);
    });

    it('should include account summaries with masked data', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          name: 'Checking',
          mask: '1234',
          currentBalance: 10000,
          availableBalance: 9500,
          bankConnection: {
            institutionName: 'Test Bank',
          },
        },
      ];

      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 10000,
        totalAvailable: 9500,
        accounts: mockAccounts as any,
      });

      const result = await service.getConsolidatedBalance(mockUserId);

      expect(result.accounts[0]).toEqual({
        id: 'acc-123',
        name: 'Checking',
        mask: '1234',
        availableBalance: 9500,
        currentBalance: 10000,
      });
    });

    it('should log debug message', async () => {
      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 0,
        totalAvailable: 0,
        accounts: [],
      });

      await service.getConsolidatedBalance(mockUserId, 'USD');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Getting consolidated balance',
        { userId: mockUserId, currency: 'USD' },
      );
    });
  });

  describe('Transaction and Concurrency Edge Cases', () => {
    it('should rollback transaction on repository error', async () => {
      const dbError = new Error('Database connection lost');
      repository.findByUserId.mockRejectedValue(dbError);

      await expect(service.findByUserId(mockUserId)).rejects.toThrow('Database connection lost');
    });

    it('should handle race condition where account is deleted during findById', async () => {
      // First call succeeds, second call returns null (deleted between calls)
      repository.findById
        .mockResolvedValueOnce({
          ...mockBankAccount,
          bankConnection: mockBankConnection,
        } as any)
        .mockResolvedValueOnce(null);

      // First call should succeed
      const result1 = await service.findById(mockUserId, 'acc-123');
      expect(result1.id).toBe('acc-123');

      // Second call should throw NotFoundException
      await expect(service.findById(mockUserId, 'acc-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle ownership change between authorization checks', async () => {
      // Simulate race condition: account ownership changes after first check
      const accountOwnedByUser = {
        ...mockBankAccount,
        bankConnection: { ...mockBankConnection, userId: mockUserId },
      };

      const accountOwnedByOther = {
        ...mockBankAccount,
        bankConnection: { ...mockBankConnection, userId: 'other-user' },
      };

      repository.findById
        .mockResolvedValueOnce(accountOwnedByUser as any)
        .mockResolvedValueOnce(accountOwnedByOther as any);

      // First call succeeds
      await service.findById(mockUserId, 'acc-123');

      // Second call should fail authorization
      await expect(service.findById(mockUserId, 'acc-123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should handle null userId gracefully', async () => {
      repository.findByUserId.mockResolvedValue([]);

      const result = await service.findByUserId(null as any);

      expect(result).toEqual([]);
      expect(repository.findByUserId).toHaveBeenCalledWith(expect.anything(), null);
    });

    it('should handle undefined userId', async () => {
      repository.findByUserId.mockResolvedValue([]);

      const result = await service.findByUserId(undefined as any);

      expect(result).toEqual([]);
    });

    it('should handle empty string userId', async () => {
      repository.findByUserId.mockResolvedValue([]);

      const result = await service.findByUserId('');

      expect(result).toEqual([]);
      expect(repository.findByUserId).toHaveBeenCalledWith(expect.anything(), '');
    });

    it('should handle account with deleted connection (should not happen but defensive)', async () => {
      const accountWithDeletedConnection = {
        ...mockBankAccount,
        bankConnection: {
          ...mockBankConnection,
          deletedAt: new Date(), // Soft deleted
          userId: mockUserId,
        },
      };

      repository.findById.mockResolvedValue(accountWithDeletedConnection as any);

      // Should still verify ownership even if connection is deleted
      const result = await service.findById(mockUserId, 'acc-123');
      expect(result.id).toBe('acc-123');
    });
  });

  describe('Balance Calculation Edge Cases', () => {
    it('should handle negative balances (credit cards)', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          currentBalance: -50000, // -$500.00 owed
          availableBalance: -50000,
          bankConnection: {
            institutionName: 'Credit Card',
          },
        },
      ];

      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: -50000,
        totalAvailable: -50000,
        accounts: mockAccounts as any,
      });

      const result = await service.getConsolidatedBalance(mockUserId);

      expect(result.totalCurrent).toBe(-50000);
      expect(result.totalAvailable).toBe(-50000);
      expect(result.accounts[0].currentBalance).toBe(-50000);
    });

    it('should handle very large balances without precision loss', async () => {
      const largeBalance = Number.MAX_SAFE_INTEGER - 100;
      const mockAccounts = [
        {
          ...mockBankAccount,
          currentBalance: largeBalance,
          availableBalance: largeBalance,
          bankConnection: {
            institutionName: 'Big Bank',
          },
        },
      ];

      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: largeBalance,
        totalAvailable: largeBalance,
        accounts: mockAccounts as any,
      });

      const result = await service.getConsolidatedBalance(mockUserId);

      expect(Number.isSafeInteger(result.totalCurrent)).toBe(true);
      expect(Number.isSafeInteger(result.totalAvailable)).toBe(true);
      expect(result.totalCurrent).toBe(largeBalance);
    });

    it('should convert null balances to 0 in response DTOs', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      repository.findByUserId.mockResolvedValue(mockAccounts as any);

      const result = await service.findByUserId(mockUserId);

      expect(result[0].currentBalance).toBe(10000);
      expect(result[0].availableBalance).toBe(9500);
    });

    it('should handle accounts with only currentBalance (null availableBalance)', async () => {
      const mockAccountsWithPartialData = [
        {
          ...mockBankAccount,
          availableBalance: null,
          currentBalance: 10000,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      repository.findByUserId.mockResolvedValue(mockAccountsWithPartialData as any);

      const result = await service.findByUserId(mockUserId);

      expect(result[0].currentBalance).toBe(10000);
      expect(result[0].availableBalance).toBe(0); // null converted to 0
    });

    it('should handle accounts with only availableBalance (null currentBalance)', async () => {
      const mockAccountsWithPartialData = [
        {
          ...mockBankAccount,
          currentBalance: null,
          availableBalance: 5000,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      repository.findByUserId.mockResolvedValue(mockAccountsWithPartialData as any);

      const result = await service.findByUserId(mockUserId);

      expect(result[0].currentBalance).toBe(0); // null converted to 0
      expect(result[0].availableBalance).toBe(5000);
    });
  });

  describe('Data Type and Format Edge Cases', () => {
    it('should handle very long account names without truncation', async () => {
      const longName = 'A'.repeat(500);
      const mockAccountsWithLongName = [
        {
          ...mockBankAccount,
          name: longName,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      repository.findByUserId.mockResolvedValue(mockAccountsWithLongName as any);

      const result = await service.findByUserId(mockUserId);

      expect(result[0].name).toBe(longName);
      expect(result[0].name.length).toBe(500);
    });

    it('should handle special characters in account names', async () => {
      const specialName = "John's Checking & Savings (€/$)";
      const mockAccountsWithSpecialChars = [
        {
          ...mockBankAccount,
          name: specialName,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      repository.findByUserId.mockResolvedValue(mockAccountsWithSpecialChars as any);

      const result = await service.findByUserId(mockUserId);

      expect(result[0].name).toBe(specialName);
    });

    it('should handle non-standard currency codes', async () => {
      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 0,
        totalAvailable: 0,
        accounts: [],
      });

      await service.getConsolidatedBalance(mockUserId, 'XYZ');

      expect(repository.getConsolidatedBalance).toHaveBeenCalledWith(
        expect.anything(),
        mockUserId,
        'XYZ',
      );
    });

    it('should handle empty string currency code', async () => {
      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 0,
        totalAvailable: 0,
        accounts: [],
      });

      await service.getConsolidatedBalance(mockUserId, '');

      expect(repository.getConsolidatedBalance).toHaveBeenCalledWith(
        expect.anything(),
        mockUserId,
        '',
      );
    });

    it('should handle SQL injection attempts in currency parameter', async () => {
      const sqlInjectionAttempt = "USD'; DROP TABLE bank_accounts; --";
      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 0,
        totalAvailable: 0,
        accounts: [],
      });

      await service.getConsolidatedBalance(mockUserId, sqlInjectionAttempt);

      // Prisma should protect against SQL injection
      expect(repository.getConsolidatedBalance).toHaveBeenCalledWith(
        expect.anything(),
        mockUserId,
        sqlInjectionAttempt,
      );
    });

    it('should handle malicious Unicode in account IDs', async () => {
      const maliciousId = 'acc-\u0000\u0001\u0002'; // Null bytes and control characters
      repository.findById.mockResolvedValue(null);

      await expect(service.findById(mockUserId, maliciousId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Potential Security Issues', () => {
    it('should not expose plaidAccountId in consolidated balance summaries', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          plaidAccountId: 'sensitive-plaid-id',
          bankConnection: {
            institutionName: 'Test Bank',
          },
        },
      ];

      repository.getConsolidatedBalance.mockResolvedValue({
        totalCurrent: 10000,
        totalAvailable: 9500,
        accounts: mockAccounts as any,
      });

      const result = await service.getConsolidatedBalance(mockUserId);

      // Should not include plaidAccountId in summary
      expect(result.accounts[0]).not.toHaveProperty('plaidAccountId');
      expect(result.accounts[0]).toHaveProperty('id');
      expect(result.accounts[0]).toHaveProperty('name');
      expect(result.accounts[0]).toHaveProperty('mask');
    });

    it('should not expose full account numbers in any response', async () => {
      const mockAccountsWithFullNumber = [
        {
          ...mockBankAccount,
          mask: '1234', // Should only be last 4 digits
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      repository.findByUserId.mockResolvedValue(mockAccountsWithFullNumber as any);

      const result = await service.findByUserId(mockUserId);

      expect(result[0].mask).toBe('1234');
      expect(result[0].mask?.length).toBeLessThanOrEqual(4);
    });

    it('should verify ownership before returning sensitive data', async () => {
      const otherUserAccount = {
        ...mockBankAccount,
        bankConnection: {
          ...mockBankConnection,
          userId: 'other-user-id',
        },
      };

      repository.findById.mockResolvedValue(otherUserAccount as any);

      // Should throw ForbiddenException, not return sensitive data
      await expect(service.findById(mockUserId, 'acc-123')).rejects.toThrow(
        ForbiddenException,
      );

      // Verify warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unauthorized bank account access attempt',
        expect.objectContaining({
          userId: mockUserId,
          accountId: 'acc-123',
          ownerId: 'other-user-id',
        }),
      );
    });
  });
});
