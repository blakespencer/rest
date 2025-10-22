import { BankConnectionRepository } from '../bank-connection.repository';
import { Prisma } from '@prisma/client';

describe('BankConnectionRepository', () => {
  let repository: BankConnectionRepository;
  let mockTx: any;

  beforeEach(() => {
    repository = new BankConnectionRepository();

    mockTx = {
      bankConnection: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bankAccount: {
        upsert: jest.fn(),
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should find connection by ID and include accounts', async () => {
      const mockConnection = {
        id: 'conn-123',
        userId: 'user-123',
        accessToken: 'encrypted',
        itemId: 'item-123',
        institutionId: 'ins_109508',
        institutionName: 'Test Bank',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      };

      mockTx.bankConnection.findFirst.mockResolvedValue(mockConnection);

      const result = await repository.findById(mockTx, 'conn-123');

      expect(result).toEqual(mockConnection);
      expect(mockTx.bankConnection.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'conn-123',
          deletedAt: null, // CRITICAL: Should only return non-deleted
        },
        include: {
          accounts: true,
        },
      });
    });

    it('should return null if connection is deleted (soft delete filter)', async () => {
      mockTx.bankConnection.findFirst.mockResolvedValue(null);

      const result = await repository.findById(mockTx, 'conn-deleted');

      expect(result).toBeNull();

      // CRITICAL: Verify deletedAt filter was applied
      expect(mockTx.bankConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    it('should return null if connection does not exist', async () => {
      mockTx.bankConnection.findFirst.mockResolvedValue(null);

      const result = await repository.findById(mockTx, 'conn-nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find all non-deleted connections for user', async () => {
      const mockConnections = [
        {
          id: 'conn-1',
          userId: 'user-123',
          deletedAt: null,
          accounts: [],
        },
        {
          id: 'conn-2',
          userId: 'user-123',
          deletedAt: null,
          accounts: [],
        },
      ];

      mockTx.bankConnection.findMany.mockResolvedValue(mockConnections);

      const result = await repository.findByUserId(mockTx, 'user-123');

      expect(result).toHaveLength(2);
      expect(mockTx.bankConnection.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          deletedAt: null, // CRITICAL: Should filter deleted
        },
        include: {
          accounts: true,
        },
        orderBy: {
          createdAt: 'desc', // Newest first
        },
      });
    });

    it('should return empty array if user has no connections', async () => {
      mockTx.bankConnection.findMany.mockResolvedValue([]);

      const result = await repository.findByUserId(mockTx, 'user-no-connections');

      expect(result).toEqual([]);
    });

    it('should NOT include soft-deleted connections', async () => {
      mockTx.bankConnection.findMany.mockResolvedValue([]);

      await repository.findByUserId(mockTx, 'user-123');

      // Verify deletedAt filter
      expect(mockTx.bankConnection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });

  describe('findByItemId', () => {
    it('should find connection by Plaid item ID', async () => {
      const mockConnection = {
        id: 'conn-123',
        userId: 'user-123',
        itemId: 'item-unique',
        deletedAt: null,
      };

      mockTx.bankConnection.findFirst.mockResolvedValue(mockConnection);

      const result = await repository.findByItemId(mockTx, 'item-unique');

      expect(result).toEqual(mockConnection);
      expect(mockTx.bankConnection.findFirst).toHaveBeenCalledWith({
        where: {
          itemId: 'item-unique',
          deletedAt: null,
        },
      });
    });

    it('should return null if itemId does not exist', async () => {
      mockTx.bankConnection.findFirst.mockResolvedValue(null);

      const result = await repository.findByItemId(mockTx, 'item-nonexistent');

      expect(result).toBeNull();
    });

    it('should NOT return soft-deleted connections', async () => {
      mockTx.bankConnection.findFirst.mockResolvedValue(null);

      await repository.findByItemId(mockTx, 'item-deleted');

      expect(mockTx.bankConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should create bank connection with default ACTIVE status', async () => {
      const createData = {
        userId: 'user-123',
        accessToken: 'encrypted-token',
        itemId: 'item-123',
        institutionId: 'ins_109508',
        institutionName: 'Test Bank',
      };

      const mockCreated = {
        id: 'conn-new',
        ...createData,
        status: 'ACTIVE',
        lastSyncedAt: null,
        lastSyncStatus: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTx.bankConnection.create.mockResolvedValue(mockCreated);

      const result = await repository.create(mockTx, createData);

      expect(result).toEqual(mockCreated);
      expect(mockTx.bankConnection.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          accessToken: 'encrypted-token',
          itemId: 'item-123',
          institutionId: 'ins_109508',
          institutionName: 'Test Bank',
          status: 'ACTIVE', // CRITICAL: Default status
        },
      });
    });

    it('should create without optional institutionName', async () => {
      const createData = {
        userId: 'user-123',
        accessToken: 'encrypted-token',
        itemId: 'item-123',
        institutionId: 'ins_109508',
      };

      const mockCreated = {
        id: 'conn-new',
        ...createData,
        institutionName: undefined,
        status: 'ACTIVE',
        lastSyncedAt: null,
        lastSyncStatus: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTx.bankConnection.create.mockResolvedValue(mockCreated);

      await repository.create(mockTx, createData);

      expect(mockTx.bankConnection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          institutionName: undefined,
        }),
      });
    });
  });

  describe('update', () => {
    it('should update connection with provided fields', async () => {
      const updateData = {
        status: 'DISCONNECTED',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'FAILED',
      };

      const mockUpdated = {
        id: 'conn-123',
        userId: 'user-123',
        ...updateData,
      };

      mockTx.bankConnection.update.mockResolvedValue(mockUpdated);

      const result = await repository.update(mockTx, 'conn-123', updateData);

      expect(result).toEqual(mockUpdated);
      expect(mockTx.bankConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: updateData,
      });
    });

    it('should allow partial updates', async () => {
      const updateData = {
        institutionName: 'Updated Bank Name',
      };

      const mockUpdated = {
        id: 'conn-123',
        institutionName: 'Updated Bank Name',
      };

      mockTx.bankConnection.update.mockResolvedValue(mockUpdated);

      await repository.update(mockTx, 'conn-123', updateData);

      expect(mockTx.bankConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: { institutionName: 'Updated Bank Name' },
      });
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt and status to DISCONNECTED', async () => {
      const mockDeleted = {
        id: 'conn-123',
        userId: 'user-123',
        status: 'DISCONNECTED',
        deletedAt: expect.any(Date),
      };

      mockTx.bankConnection.update.mockResolvedValue(mockDeleted);

      const result = await repository.softDelete(mockTx, 'conn-123');

      expect(result.status).toBe('DISCONNECTED');
      expect(result.deletedAt).toBeDefined();

      expect(mockTx.bankConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: {
          deletedAt: expect.any(Date),
          status: 'DISCONNECTED',
        },
      });
    });

    it('should not permanently delete the record (soft delete pattern)', async () => {
      mockTx.bankConnection.update.mockResolvedValue({
        id: 'conn-123',
        deletedAt: new Date(),
        status: 'DISCONNECTED',
      });

      await repository.softDelete(mockTx, 'conn-123');

      // Should use UPDATE not DELETE
      expect(mockTx.bankConnection.update).toHaveBeenCalled();
      expect(mockTx.bankConnection.delete).toBeUndefined();
    });
  });

  describe('upsertAccounts', () => {
    it('should upsert multiple accounts', async () => {
      const accounts = [
        {
          plaidAccountId: 'acc-1',
          name: 'Checking',
          type: 'depository',
          subtype: 'checking',
          mask: '1234',
          currentBalance: 100000,
          availableBalance: 95000,
          isoCurrencyCode: 'USD',
        },
        {
          plaidAccountId: 'acc-2',
          name: 'Savings',
          type: 'depository',
          subtype: 'savings',
          mask: '5678',
          currentBalance: 50000,
          availableBalance: 50000,
          isoCurrencyCode: 'USD',
        },
      ];

      const mockUpserted1 = {
        id: 'db-acc-1',
        bankConnectionId: 'conn-123',
        ...accounts[0],
      };

      const mockUpserted2 = {
        id: 'db-acc-2',
        bankConnectionId: 'conn-123',
        ...accounts[1],
      };

      mockTx.bankAccount.upsert
        .mockResolvedValueOnce(mockUpserted1)
        .mockResolvedValueOnce(mockUpserted2);

      const result = await repository.upsertAccounts(mockTx, 'conn-123', accounts);

      expect(result).toHaveLength(2);
      expect(result[0].plaidAccountId).toBe('acc-1');
      expect(result[1].plaidAccountId).toBe('acc-2');

      // Verify upsert was called twice
      expect(mockTx.bankAccount.upsert).toHaveBeenCalledTimes(2);

      // Verify first upsert
      expect(mockTx.bankAccount.upsert).toHaveBeenNthCalledWith(1, {
        where: { plaidAccountId: 'acc-1' },
        update: expect.objectContaining({
          name: 'Checking',
          currentBalance: 100000,
        }),
        create: expect.objectContaining({
          bankConnectionId: 'conn-123',
          plaidAccountId: 'acc-1',
          name: 'Checking',
        }),
      });
    });

    it('should default to USD if currency code not provided', async () => {
      const accounts = [
        {
          plaidAccountId: 'acc-1',
          name: 'Checking',
          type: 'depository',
          currentBalance: 100000,
          availableBalance: 95000,
          // No isoCurrencyCode
        },
      ];

      mockTx.bankAccount.upsert.mockResolvedValue({
        id: 'db-acc-1',
        bankConnectionId: 'conn-123',
        ...accounts[0],
        isoCurrencyCode: 'USD',
      });

      await repository.upsertAccounts(mockTx, 'conn-123', accounts);

      expect(mockTx.bankAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            isoCurrencyCode: 'USD',
          }),
          create: expect.objectContaining({
            isoCurrencyCode: 'USD',
          }),
        }),
      );
    });

    it('should handle null balance values', async () => {
      const accounts = [
        {
          plaidAccountId: 'acc-credit',
          name: 'Credit Card',
          type: 'credit',
          subtype: 'credit card',
          mask: '9999',
          currentBalance: null,
          availableBalance: null,
          isoCurrencyCode: 'USD',
        },
      ];

      mockTx.bankAccount.upsert.mockResolvedValue({
        id: 'db-acc-credit',
        bankConnectionId: 'conn-123',
        ...accounts[0],
      });

      await repository.upsertAccounts(mockTx, 'conn-123', accounts);

      expect(mockTx.bankAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            currentBalance: null,
            availableBalance: null,
          }),
          create: expect.objectContaining({
            currentBalance: null,
            availableBalance: null,
          }),
        }),
      );
    });

    it('should handle empty accounts array', async () => {
      const result = await repository.upsertAccounts(mockTx, 'conn-123', []);

      expect(result).toEqual([]);
      expect(mockTx.bankAccount.upsert).not.toHaveBeenCalled();
    });

    it('should upsert existing account (update path)', async () => {
      const accounts = [
        {
          plaidAccountId: 'acc-existing',
          name: 'Updated Name',
          type: 'depository',
          subtype: 'checking',
          mask: '1234',
          currentBalance: 200000, // Updated balance
          availableBalance: 195000,
          isoCurrencyCode: 'USD',
        },
      ];

      const mockUpdated = {
        id: 'db-acc-existing',
        bankConnectionId: 'conn-123',
        ...accounts[0],
      };

      mockTx.bankAccount.upsert.mockResolvedValue(mockUpdated);

      const result = await repository.upsertAccounts(mockTx, 'conn-123', accounts);

      // Should have been updated, not created
      expect(result[0].currentBalance).toBe(200000);
      expect(mockTx.bankAccount.upsert).toHaveBeenCalledWith({
        where: { plaidAccountId: 'acc-existing' },
        update: expect.objectContaining({
          currentBalance: 200000,
          name: 'Updated Name',
        }),
        create: expect.any(Object),
      });
    });
  });
});
