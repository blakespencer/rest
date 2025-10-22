import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '../../common/logging/logger.service';
import { SecclAccountRepository } from '../seccl-account.repository';
import { InvestmentOrderRepository } from '../investment-order.repository';
import { InvestmentPositionRepository } from '../investment-position.repository';

/**
 * Investment Repositories Unit Tests
 *
 * Tests database operations with mocked Prisma:
 * - Query construction and parameters
 * - Data transformation
 * - Include/orderBy clauses
 * - Unique constraints (idempotency key, Seccl position ID)
 *
 * NO VANITY TESTS - Validates data access layer correctness
 */
describe('Investment Repositories', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let mockTx: any;

  beforeEach(() => {
    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Mock Prisma transaction client
    mockTx = {
      secclAccount: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      investmentOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      investmentPosition: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
    };
  });

  describe('SecclAccountRepository', () => {
    let repo: SecclAccountRepository;

    beforeEach(() => {
      repo = new SecclAccountRepository(mockLogger);
    });

    it('should create account with all required fields', async () => {
      const createData = {
        userId: 'user-123',
        secclAccountId: 'ACC-789',
        secclClientId: 'CLIENT-456',
        firmId: 'MOCK_FIRM',
        accountName: 'Test ISA',
        accountType: 'Wrapper',
        wrapperType: 'ISA',
        currency: 'GBP',
        status: 'Active',
      };

      const mockAccount = { id: 'account-123', ...createData };
      mockTx.secclAccount.create.mockResolvedValue(mockAccount);

      const result = await repo.create(mockTx, createData);

      expect(mockTx.secclAccount.create).toHaveBeenCalledWith({
        data: createData,
      });
      expect(result).toEqual(mockAccount);
    });

    it('should find by ID with positions and orders included', async () => {
      const mockAccount = {
        id: 'account-123',
        positions: [{ id: 'pos-1' }, { id: 'pos-2' }],
        investmentOrders: [{ id: 'order-1' }],
      };

      mockTx.secclAccount.findUnique.mockResolvedValue(mockAccount);

      const result = await repo.findById(mockTx, 'account-123');

      expect(mockTx.secclAccount.findUnique).toHaveBeenCalledWith({
        where: { id: 'account-123' },
        include: {
          positions: true,
          investmentOrders: true,
        },
      });
      expect(result).toEqual(mockAccount);
      expect(result!.positions.length).toBe(2);
    });

    it('should find by Seccl account ID', async () => {
      const mockAccount = { id: 'account-123', secclAccountId: 'ACC-789' };
      mockTx.secclAccount.findUnique.mockResolvedValue(mockAccount);

      const result = await repo.findBySecclAccountId(mockTx, 'ACC-789');

      expect(mockTx.secclAccount.findUnique).toHaveBeenCalledWith({
        where: { secclAccountId: 'ACC-789' },
      });
      expect(result).toEqual(mockAccount);
    });

    it('should find all accounts for user ordered by creation date', async () => {
      const mockAccounts = [
        { id: 'account-2', userId: 'user-123', createdAt: new Date('2025-10-22') },
        { id: 'account-1', userId: 'user-123', createdAt: new Date('2025-10-21') },
      ];

      mockTx.secclAccount.findMany.mockResolvedValue(mockAccounts);

      const result = await repo.findByUserId(mockTx, 'user-123');

      expect(mockTx.secclAccount.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        include: {
          positions: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(result.length).toBe(2);
    });

    it('should update account balances', async () => {
      const updateData = {
        cashBalance: 5000,
        totalValue: 15000,
        status: 'Active',
      };

      const mockUpdated = { id: 'account-123', ...updateData };
      mockTx.secclAccount.update.mockResolvedValue(mockUpdated);

      const result = await repo.update(mockTx, 'account-123', updateData);

      expect(mockTx.secclAccount.update).toHaveBeenCalledWith({
        where: { id: 'account-123' },
        data: updateData,
      });
      expect(result).toEqual(mockUpdated);
    });

    it('should return null if account not found', async () => {
      mockTx.secclAccount.findUnique.mockResolvedValue(null);

      const result = await repo.findById(mockTx, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('InvestmentOrderRepository', () => {
    let repo: InvestmentOrderRepository;

    beforeEach(() => {
      repo = new InvestmentOrderRepository(mockLogger);
    });

    it('should create order with all fields', async () => {
      const createData = {
        userId: 'user-123',
        secclAccountId: 'account-456',
        fundId: '275F1',
        fundName: 'Money Market Fund',
        amount: 9800,
        currency: 'GBP',
        idempotencyKey: 'unique-key-123',
        linkId: 'TG-123',
        paymentId: 'PAY-123',
        orderId: 'ORD-123',
      };

      const mockOrder = { id: 'order-123', ...createData };
      mockTx.investmentOrder.create.mockResolvedValue(mockOrder);

      const result = await repo.create(mockTx, createData);

      expect(mockTx.investmentOrder.create).toHaveBeenCalledWith({
        data: createData,
      });
      expect(result.idempotencyKey).toBe('unique-key-123');
    });

    it('should find by idempotency key (unique constraint)', async () => {
      const mockOrder = {
        id: 'order-123',
        idempotencyKey: 'unique-key-abc',
        status: 'ORDER_COMPLETED',
      };

      mockTx.investmentOrder.findUnique.mockResolvedValue(mockOrder);

      const result = await repo.findByIdempotencyKey(mockTx, 'unique-key-abc');

      expect(mockTx.investmentOrder.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'unique-key-abc' },
      });
      expect(result).toEqual(mockOrder);
    });

    it('should find all orders for user ordered by creation date desc', async () => {
      const mockOrders = [
        { id: 'order-2', userId: 'user-123', createdAt: new Date('2025-10-22') },
        { id: 'order-1', userId: 'user-123', createdAt: new Date('2025-10-21') },
      ];

      mockTx.investmentOrder.findMany.mockResolvedValue(mockOrders);

      const result = await repo.findByUserId(mockTx, 'user-123');

      expect(mockTx.investmentOrder.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(result[0].id).toBe('order-2'); // Most recent first
    });

    it('should find orders by account ID', async () => {
      const mockOrders = [
        { id: 'order-1', secclAccountId: 'account-456' },
        { id: 'order-2', secclAccountId: 'account-456' },
      ];

      mockTx.investmentOrder.findMany.mockResolvedValue(mockOrders);

      const result = await repo.findBySecclAccountId(mockTx, 'account-456');

      expect(mockTx.investmentOrder.findMany).toHaveBeenCalledWith({
        where: { secclAccountId: 'account-456' },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(result.length).toBe(2);
    });

    it('should update order with execution details', async () => {
      const updateData = {
        status: 'ORDER_COMPLETED',
        executedAt: new Date(),
        executedQuantity: 43,
        executionPrice: 2.27,
        executedAmount: 9761,
      };

      const mockUpdated = { id: 'order-123', ...updateData };
      mockTx.investmentOrder.update.mockResolvedValue(mockUpdated);

      const result = await repo.update(mockTx, 'order-123', updateData);

      expect(mockTx.investmentOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: updateData,
      });
      expect(result.executedQuantity).toBe(43);
    });

    it('should update order status partially', async () => {
      const updateData = { status: 'PAYMENT_COMPLETED' };

      mockTx.investmentOrder.update.mockResolvedValue({
        id: 'order-123',
        status: 'PAYMENT_COMPLETED',
      } as any);

      await repo.update(mockTx, 'order-123', updateData);

      expect(mockTx.investmentOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: updateData,
      });
    });

    it('should return null if order not found by idempotency key', async () => {
      mockTx.investmentOrder.findUnique.mockResolvedValue(null);

      const result = await repo.findByIdempotencyKey(mockTx, 'non-existent-key');

      expect(result).toBeNull();
    });
  });

  describe('InvestmentPositionRepository', () => {
    let repo: InvestmentPositionRepository;

    beforeEach(() => {
      repo = new InvestmentPositionRepository(mockLogger);
    });

    it('should create position with all fields', async () => {
      const createData = {
        userId: 'user-123',
        secclAccountId: 'account-456',
        secclPositionId: 'ACC-789|S|275F1',
        fundId: '275F1',
        fundName: 'Money Market Fund',
        isin: 'GB00MOCK1234',
        quantity: 43,
        bookValue: 9761,
        currentValue: 9761,
        growth: 0,
        growthPercent: 0,
        currency: 'GBP',
      };

      const mockPosition = { id: 'pos-123', ...createData };
      mockTx.investmentPosition.create.mockResolvedValue(mockPosition);

      const result = await repo.create(mockTx, createData);

      expect(mockTx.investmentPosition.create).toHaveBeenCalledWith({
        data: createData,
      });
      expect(result.secclPositionId).toBe('ACC-789|S|275F1');
    });

    it('should find by Seccl position ID (unique constraint)', async () => {
      const mockPosition = {
        id: 'pos-123',
        secclPositionId: 'ACC-789|S|275F1',
        quantity: 86,
      };

      mockTx.investmentPosition.findUnique.mockResolvedValue(mockPosition);

      const result = await repo.findBySecclPositionId(mockTx, 'ACC-789|S|275F1');

      expect(mockTx.investmentPosition.findUnique).toHaveBeenCalledWith({
        where: { secclPositionId: 'ACC-789|S|275F1' },
      });
      expect(result).toEqual(mockPosition);
    });

    it('should find all positions for user', async () => {
      const mockPositions = [
        { id: 'pos-1', userId: 'user-123', quantity: 43 },
        { id: 'pos-2', userId: 'user-123', quantity: 50 },
      ];

      mockTx.investmentPosition.findMany.mockResolvedValue(mockPositions);

      const result = await repo.findByUserId(mockTx, 'user-123');

      expect(mockTx.investmentPosition.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(result.length).toBe(2);
    });

    it('should find positions by account ID', async () => {
      const mockPositions = [
        { id: 'pos-1', secclAccountId: 'account-456', quantity: 86 },
      ];

      mockTx.investmentPosition.findMany.mockResolvedValue(mockPositions);

      const result = await repo.findBySecclAccountId(mockTx, 'account-456');

      expect(mockTx.investmentPosition.findMany).toHaveBeenCalledWith({
        where: { secclAccountId: 'account-456' },
      });
      expect(result[0].quantity).toBe(86);
    });

    it('should update position and set lastUpdatedAt', async () => {
      const updateData = {
        quantity: 86,
        bookValue: 19522,
        currentValue: 19600,
        growth: 78,
        growthPercent: 0.4,
      };

      const mockUpdated = {
        id: 'pos-123',
        ...updateData,
        lastUpdatedAt: new Date(),
      };
      mockTx.investmentPosition.update.mockResolvedValue(mockUpdated);

      const result = await repo.update(mockTx, 'pos-123', updateData);

      expect(mockTx.investmentPosition.update).toHaveBeenCalledWith({
        where: { id: 'pos-123' },
        data: {
          ...updateData,
          lastUpdatedAt: expect.any(Date),
        },
      });
      expect(result.lastUpdatedAt).toBeDefined();
    });

    it('should upsert position (create or update)', async () => {
      const createData = {
        userId: 'user-123',
        secclAccountId: 'account-456',
        secclPositionId: 'ACC-789|S|275F1',
        fundId: '275F1',
        fundName: 'Money Market Fund',
        quantity: 43,
        bookValue: 9761,
        currentValue: 9761,
        growth: 0,
        growthPercent: 0,
        currency: 'GBP',
      };

      const updateData = {
        quantity: 86,
        bookValue: 19522,
        currentValue: 19522,
      };

      const mockUpserted = { id: 'pos-123', ...createData, ...updateData };
      mockTx.investmentPosition.upsert.mockResolvedValue(mockUpserted);

      const result = await repo.upsert(
        mockTx,
        'ACC-789|S|275F1',
        createData,
        updateData,
      );

      expect(mockTx.investmentPosition.upsert).toHaveBeenCalledWith({
        where: { secclPositionId: 'ACC-789|S|275F1' },
        create: createData,
        update: {
          ...updateData,
          lastUpdatedAt: expect.any(Date),
        },
      });
      expect(result.quantity).toBe(86);
    });

    it('should return null if position not found', async () => {
      mockTx.investmentPosition.findUnique.mockResolvedValue(null);

      const result = await repo.findBySecclPositionId(
        mockTx,
        'non-existent-position',
      );

      expect(result).toBeNull();
    });
  });

  describe('Repository Base Functionality', () => {
    it('should set logger context on initialization', () => {
      const repo1 = new SecclAccountRepository(mockLogger);
      const repo2 = new InvestmentOrderRepository(mockLogger);
      const repo3 = new InvestmentPositionRepository(mockLogger);

      expect(mockLogger.setContext).toHaveBeenCalledWith('SecclAccountRepository');
      expect(mockLogger.setContext).toHaveBeenCalledWith(
        'InvestmentOrderRepository',
      );
      expect(mockLogger.setContext).toHaveBeenCalledWith(
        'InvestmentPositionRepository',
      );
    });
  });
});
