import { Test, TestingModule } from '@nestjs/testing';
import { BankAccountRepository } from '../bank-account.repository';
import { LoggerService } from '../../common/logging/logger.service';
import { Prisma, BankAccount, BankConnection } from '@prisma/client';

describe('BankAccountRepository', () => {
  let repository: BankAccountRepository;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockTx: jest.Mocked<Prisma.TransactionClient>;

  const mockBankConnection: BankConnection = {
    id: 'conn-123',
    userId: 'user-123',
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

    mockTx = {
      bankAccount: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankAccountRepository,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    repository = module.get<BankAccountRepository>(BankAccountRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByUserId', () => {
    it('should find all accounts for a user across all connections', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
        {
          ...mockBankAccount,
          id: 'acc-456',
          name: 'Savings Account',
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.findByUserId(mockTx, 'user-123');

      expect(result).toEqual(mockAccounts);
      expect(mockTx.bankAccount.findMany).toHaveBeenCalledWith({
        where: {
          bankConnection: {
            userId: 'user-123',
            deletedAt: null,
          },
        },
        include: {
          bankConnection: {
            select: {
              institutionName: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });

    it('should return empty array when user has no accounts', async () => {
      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue([]);

      const result = await repository.findByUserId(mockTx, 'user-999');

      expect(result).toEqual([]);
    });

    it('should filter out accounts from deleted connections', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      await repository.findByUserId(mockTx, 'user-123');

      const callArgs = (mockTx.bankAccount.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.bankConnection.deletedAt).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find account by ID with connection details', async () => {
      const mockAccountWithConnection = {
        ...mockBankAccount,
        bankConnection: mockBankConnection,
      };

      mockTx.bankAccount.findUnique = jest.fn().mockResolvedValue(mockAccountWithConnection);

      const result = await repository.findById(mockTx, 'acc-123');

      expect(result).toEqual(mockAccountWithConnection);
      expect(mockTx.bankAccount.findUnique).toHaveBeenCalledWith({
        where: { id: 'acc-123' },
        include: {
          bankConnection: true,
        },
      });
    });

    it('should return null when account not found', async () => {
      mockTx.bankAccount.findUnique = jest.fn().mockResolvedValue(null);

      const result = await repository.findById(mockTx, 'acc-999');

      expect(result).toBeNull();
    });
  });

  describe('findByConnectionId', () => {
    it('should find all accounts for a specific connection', async () => {
      const mockAccounts = [
        { ...mockBankAccount, name: 'Checking' },
        { ...mockBankAccount, id: 'acc-456', name: 'Savings' },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.findByConnectionId(mockTx, 'conn-123');

      expect(result).toEqual(mockAccounts);
      expect(mockTx.bankAccount.findMany).toHaveBeenCalledWith({
        where: { bankConnectionId: 'conn-123' },
        orderBy: {
          name: 'asc',
        },
      });
    });

    it('should return accounts sorted by name', async () => {
      await repository.findByConnectionId(mockTx, 'conn-123');

      const callArgs = (mockTx.bankAccount.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ name: 'asc' });
    });
  });

  describe('getConsolidatedBalance', () => {
    it('should calculate total balances across all accounts', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          currentBalance: 10000, // $100.00
          availableBalance: 9500, // $95.00
          bankConnection: {
            institutionName: 'Bank A',
          },
        },
        {
          ...mockBankAccount,
          id: 'acc-456',
          currentBalance: 20000, // $200.00
          availableBalance: 19000, // $190.00
          bankConnection: {
            institutionName: 'Bank B',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.getConsolidatedBalance(mockTx, 'user-123', 'USD');

      expect(result.totalCurrent).toBe(30000); // $300.00
      expect(result.totalAvailable).toBe(28500); // $285.00
      expect(result.accounts).toEqual(mockAccounts);
    });

    it('should filter by currency', async () => {
      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue([]);

      await repository.getConsolidatedBalance(mockTx, 'user-123', 'EUR');

      expect(mockTx.bankAccount.findMany).toHaveBeenCalledWith({
        where: {
          isoCurrencyCode: 'EUR',
          bankConnection: {
            userId: 'user-123',
            deletedAt: null,
            status: 'ACTIVE',
          },
        },
        include: {
          bankConnection: {
            select: {
              institutionName: true,
            },
          },
        },
      });
    });

    it('should default to USD when no currency specified', async () => {
      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue([]);

      await repository.getConsolidatedBalance(mockTx, 'user-123');

      const callArgs = (mockTx.bankAccount.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.isoCurrencyCode).toBe('USD');
    });

    it('should only include accounts from active connections', async () => {
      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue([]);

      await repository.getConsolidatedBalance(mockTx, 'user-123', 'USD');

      const callArgs = (mockTx.bankAccount.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.bankConnection.status).toBe('ACTIVE');
    });

    it('should handle null balances', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          currentBalance: null,
          availableBalance: null,
          bankConnection: {
            institutionName: 'Bank A',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.getConsolidatedBalance(mockTx, 'user-123', 'USD');

      expect(result.totalCurrent).toBe(0);
      expect(result.totalAvailable).toBe(0);
    });

    it('should return zero balances when no accounts found', async () => {
      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue([]);

      const result = await repository.getConsolidatedBalance(mockTx, 'user-123', 'USD');

      expect(result.totalCurrent).toBe(0);
      expect(result.totalAvailable).toBe(0);
      expect(result.accounts).toEqual([]);
    });

    it('should handle negative balances (credit cards, overdrafts)', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          type: 'credit',
          currentBalance: -50000, // -$500.00 owed
          availableBalance: -50000,
          bankConnection: {
            institutionName: 'Credit Card Co',
          },
        },
        {
          ...mockBankAccount,
          id: 'acc-456',
          type: 'depository',
          currentBalance: 10000, // $100.00
          availableBalance: -500, // Overdraft of $5.00
          bankConnection: {
            institutionName: 'Bank A',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.getConsolidatedBalance(mockTx, 'user-123', 'USD');

      expect(result.totalCurrent).toBe(-40000); // -$400.00 net
      expect(result.totalAvailable).toBe(-50500); // -$505.00 net
    });

    it('should handle very large balances without overflow', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          currentBalance: Number.MAX_SAFE_INTEGER - 1000,
          availableBalance: Number.MAX_SAFE_INTEGER - 2000,
          bankConnection: {
            institutionName: 'Bank A',
          },
        },
        {
          ...mockBankAccount,
          id: 'acc-456',
          currentBalance: 500,
          availableBalance: 1000,
          bankConnection: {
            institutionName: 'Bank B',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.getConsolidatedBalance(mockTx, 'user-123', 'USD');

      // Should not overflow MAX_SAFE_INTEGER
      expect(result.totalCurrent).toBe(Number.MAX_SAFE_INTEGER - 500);
      expect(result.totalAvailable).toBe(Number.MAX_SAFE_INTEGER - 1000);
      expect(Number.isSafeInteger(result.totalCurrent)).toBe(true);
      expect(Number.isSafeInteger(result.totalAvailable)).toBe(true);
    });

    it('should handle accounts with zero balances', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          currentBalance: 0,
          availableBalance: 0,
          bankConnection: {
            institutionName: 'Empty Bank',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.getConsolidatedBalance(mockTx, 'user-123', 'USD');

      expect(result.totalCurrent).toBe(0);
      expect(result.totalAvailable).toBe(0);
    });

    it('should handle mixed null and numeric balances correctly', async () => {
      const mockAccounts = [
        {
          ...mockBankAccount,
          currentBalance: 10000,
          availableBalance: null, // Only current balance available
          bankConnection: {
            institutionName: 'Bank A',
          },
        },
        {
          ...mockBankAccount,
          id: 'acc-456',
          currentBalance: null, // Only available balance available
          availableBalance: 5000,
          bankConnection: {
            institutionName: 'Bank B',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.getConsolidatedBalance(mockTx, 'user-123', 'USD');

      expect(result.totalCurrent).toBe(10000); // Only first account counted
      expect(result.totalAvailable).toBe(5000); // Only second account counted
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle empty userId without crashing', async () => {
      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue([]);

      const result = await repository.findByUserId(mockTx, '');

      expect(result).toEqual([]);
      expect(mockTx.bankAccount.findMany).toHaveBeenCalled();
    });

    it('should handle malformed UUID in findById', async () => {
      mockTx.bankAccount.findUnique = jest.fn().mockResolvedValue(null);

      const result = await repository.findById(mockTx, 'not-a-valid-uuid');

      expect(result).toBeNull();
    });

    it('should handle very long account names', async () => {
      const longName = 'A'.repeat(1000);
      const mockAccounts = [
        {
          ...mockBankAccount,
          name: longName,
          bankConnection: {
            institutionName: 'Test Bank',
            status: 'ACTIVE',
          },
        },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      const result = await repository.findByUserId(mockTx, 'user-123');

      expect(result[0].name).toBe(longName);
      expect(result[0].name.length).toBe(1000);
    });

    it('should handle special characters in currency codes', async () => {
      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue([]);

      await repository.getConsolidatedBalance(mockTx, 'user-123', 'US$');

      const callArgs = (mockTx.bankAccount.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.isoCurrencyCode).toBe('US$');
    });

    it('should preserve account order when finding by connection', async () => {
      const mockAccounts = [
        { ...mockBankAccount, name: 'Zebra Account' },
        { ...mockBankAccount, id: 'acc-456', name: 'Apple Account' },
        { ...mockBankAccount, id: 'acc-789', name: 'Middle Account' },
      ];

      mockTx.bankAccount.findMany = jest.fn().mockResolvedValue(mockAccounts);

      await repository.findByConnectionId(mockTx, 'conn-123');

      const callArgs = (mockTx.bankAccount.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ name: 'asc' });
    });
  });
});
