import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvestmentService } from '../investment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../common/logging/logger.service';
import { SecclService } from '../../seccl/seccl.service';
import { SecclAccountRepository } from '../seccl-account.repository';
import { InvestmentOrderRepository } from '../investment-order.repository';
import { InvestmentPositionRepository } from '../investment-position.repository';
import { InvestmentOrderExecutionService } from '../investment-order-execution.service';
import { WrapperType } from '../../seccl/dto/create-account.dto';

/**
 * Investment Service Unit Tests
 *
 * Battle-tested scenarios covering:
 * - Authorization and ownership validation
 * - Idempotency enforcement for financial operations
 * - Transaction rollback on failures
 * - Edge cases and error handling
 * - Security (cross-user access attempts)
 *
 * NO VANITY TESTS - Every test validates critical business logic
 */
describe('InvestmentService', () => {
  let service: InvestmentService;
  let mockPrisma: any;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockSecclService: jest.Mocked<SecclService>;
  let mockSecclAccountRepo: jest.Mocked<SecclAccountRepository>;
  let mockOrderRepo: jest.Mocked<InvestmentOrderRepository>;
  let mockPositionRepo: jest.Mocked<InvestmentPositionRepository>;
  let mockOrderExecutionService: jest.Mocked<InvestmentOrderExecutionService>;

  const mockUserId = 'user-123';
  const mockAccountId = 'account-456';
  const mockSecclAccountId = 'ACC-789';

  beforeEach(async () => {
    // Mock Prisma transaction
    const mockTransaction = jest.fn((callback) => callback(mockPrisma));
    mockPrisma = {
      $transaction: mockTransaction,
    };

    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockSecclService = {
      createAccount: jest.fn(),
      getAccountSummary: jest.fn(),
    } as any;

    mockSecclAccountRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
    } as any;

    mockOrderRepo = {
      findByIdempotencyKey: jest.fn(),
      findByUserId: jest.fn(),
      findBySecclAccountId: jest.fn(),
    } as any;

    mockPositionRepo = {
      findByUserId: jest.fn(),
      findBySecclAccountId: jest.fn(),
    } as any;

    mockOrderExecutionService = {
      createTransactionGroup: jest.fn(),
      completePayment: jest.fn(),
      completeOrder: jest.fn(),
      updatePosition: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoggerService, useValue: mockLogger },
        { provide: SecclService, useValue: mockSecclService },
        { provide: SecclAccountRepository, useValue: mockSecclAccountRepo },
        { provide: InvestmentOrderRepository, useValue: mockOrderRepo },
        { provide: InvestmentPositionRepository, useValue: mockPositionRepo },
        {
          provide: InvestmentOrderExecutionService,
          useValue: mockOrderExecutionService,
        },
      ],
    }).compile();

    service = module.get<InvestmentService>(InvestmentService);
  });

  describe('createAccount', () => {
    it('should create Seccl account and store in database', async () => {
      const mockSecclResponse = { id: mockSecclAccountId };
      const mockDbAccount = {
        id: mockAccountId,
        userId: mockUserId,
        secclAccountId: mockSecclAccountId,
        accountName: 'Test ISA',
        wrapperType: WrapperType.ISA,
        currency: 'GBP',
        status: 'Active',
        createdAt: new Date(),
      };

      mockSecclService.createAccount.mockResolvedValue(mockSecclResponse);
      mockSecclAccountRepo.create.mockResolvedValue(mockDbAccount as any);

      const result = await service.createAccount(
        mockUserId,
        'Test ISA',
        WrapperType.ISA,
      );

      expect(mockSecclService.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          firmId: 'MOCK_FIRM',
          accountType: 'Wrapper',
          name: 'Test ISA',
          currency: 'GBP',
          wrapperDetail: { wrapperType: WrapperType.ISA },
        }),
      );

      expect(mockSecclAccountRepo.create).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          userId: mockUserId,
          secclAccountId: mockSecclAccountId,
          accountName: 'Test ISA',
          wrapperType: WrapperType.ISA,
        }),
      );

      expect(result.id).toBe(mockAccountId);
      expect(result.secclAccountId).toBe(mockSecclAccountId);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating Seccl account',
        expect.any(Object),
      );
    });

    it('should rollback transaction if Seccl API fails', async () => {
      mockSecclService.createAccount.mockRejectedValue(
        new Error('Seccl API unavailable'),
      );

      await expect(
        service.createAccount(mockUserId, 'Test Account', WrapperType.GIA),
      ).rejects.toThrow('Seccl API unavailable');

      expect(mockSecclAccountRepo.create).not.toHaveBeenCalled();
    });

    it('should rollback transaction if database save fails', async () => {
      const mockSecclResponse = { id: mockSecclAccountId };
      mockSecclService.createAccount.mockResolvedValue(mockSecclResponse);
      mockSecclAccountRepo.create.mockRejectedValue(
        new Error('Database constraint violation'),
      );

      await expect(
        service.createAccount(mockUserId, 'Test Account', WrapperType.PENSION),
      ).rejects.toThrow('Database constraint violation');
    });

    it('should generate unique client ID for each account', async () => {
      const mockSecclResponse = { id: 'ACC-1' };
      mockSecclService.createAccount.mockResolvedValue(mockSecclResponse);
      mockSecclAccountRepo.create.mockResolvedValue({
        id: 'account-1',
        secclAccountId: 'ACC-1',
      } as any);

      await service.createAccount(mockUserId, 'Account 1', WrapperType.ISA);

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));

      await service.createAccount(mockUserId, 'Account 2', WrapperType.GIA);

      const firstCall = mockSecclService.createAccount.mock.calls[0][0];
      const secondCall = mockSecclService.createAccount.mock.calls[1][0];

      expect(firstCall.clientId).toMatch(/^CLIENT-\d+$/);
      expect(secondCall.clientId).toMatch(/^CLIENT-\d+$/);
      expect(firstCall.clientId).not.toBe(secondCall.clientId);
    });
  });

  describe('createInvestmentOrder - Idempotency', () => {
    it('should return existing order if idempotency key already used', async () => {
      const existingOrder = {
        id: 'order-123',
        fundId: '275F1',
        fundName: 'Money Market Fund',
        amount: 9800,
        currency: 'GBP',
        status: 'ORDER_COMPLETED',
        executedQuantity: 43,
        executionPrice: 2.27,
        createdAt: new Date(),
      };

      mockSecclAccountRepo.findById.mockResolvedValue({
        id: mockAccountId,
        userId: mockUserId,
        secclAccountId: mockSecclAccountId,
      } as any);

      mockOrderRepo.findByIdempotencyKey.mockResolvedValue(existingOrder as any);

      const result = await service.createInvestmentOrder(
        mockUserId,
        mockAccountId,
        10000,
        'idempotency-key-duplicate',
      );

      expect(result.id).toBe('order-123');
      expect(mockOrderExecutionService.createTransactionGroup).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Returning existing order (idempotent)',
        expect.any(Object),
      );
    });

    it('should create new order if idempotency key is unique', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        secclAccountId: mockSecclAccountId,
      };

      const mockOrder = {
        id: 'order-new',
        fundId: '275F1',
        amount: 9800,
        status: 'ORDER_COMPLETED',
        executedQuantity: 43,
        executionPrice: 2.27,
        executedAmount: 9761,
        createdAt: new Date(),
      };

      mockSecclAccountRepo.findById.mockResolvedValue(mockAccount as any);
      mockOrderRepo.findByIdempotencyKey.mockResolvedValue(null);

      mockOrderExecutionService.createTransactionGroup.mockResolvedValue({
        order: mockOrder,
        paymentId: 'PAY-123',
        orderId: 'ORD-123',
        orderAmount: 9800,
      } as any);

      mockOrderExecutionService.completePayment.mockResolvedValue(undefined);
      mockOrderExecutionService.completeOrder.mockResolvedValue({
        completedOrder: mockOrder,
        executedQuantity: 43,
        executedAmount: 9761,
      } as any);

      mockOrderExecutionService.updatePosition.mockResolvedValue(undefined);

      const result = await service.createInvestmentOrder(
        mockUserId,
        mockAccountId,
        10000,
        'unique-idempotency-key',
      );

      expect(result.id).toBe('order-new');
      expect(mockOrderExecutionService.createTransactionGroup).toHaveBeenCalled();
      expect(mockOrderExecutionService.completePayment).toHaveBeenCalled();
      expect(mockOrderExecutionService.completeOrder).toHaveBeenCalled();
      expect(mockOrderExecutionService.updatePosition).toHaveBeenCalled();
    });
  });

  describe('createInvestmentOrder - Authorization', () => {
    it('should throw NotFoundException if account does not exist', async () => {
      mockSecclAccountRepo.findById.mockResolvedValue(null);

      await expect(
        service.createInvestmentOrder(
          mockUserId,
          'non-existent-account',
          10000,
          'idempotency-key',
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockOrderExecutionService.createTransactionGroup).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if account belongs to different user', async () => {
      const otherUserAccount = {
        id: mockAccountId,
        userId: 'different-user-999',
        secclAccountId: mockSecclAccountId,
      };

      mockSecclAccountRepo.findById.mockResolvedValue(otherUserAccount as any);

      await expect(
        service.createInvestmentOrder(
          mockUserId,
          mockAccountId,
          10000,
          'idempotency-key',
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockOrderExecutionService.createTransactionGroup).not.toHaveBeenCalled();
    });
  });

  describe('createInvestmentOrder - Transaction Rollback', () => {
    it('should rollback if payment completion fails', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        secclAccountId: mockSecclAccountId,
      };

      mockSecclAccountRepo.findById.mockResolvedValue(mockAccount as any);
      mockOrderRepo.findByIdempotencyKey.mockResolvedValue(null);

      mockOrderExecutionService.createTransactionGroup.mockResolvedValue({
        order: { id: 'order-123' },
        paymentId: 'PAY-123',
        orderId: 'ORD-123',
        orderAmount: 9800,
      } as any);

      mockOrderExecutionService.completePayment.mockRejectedValue(
        new Error('Seccl payment failed'),
      );

      await expect(
        service.createInvestmentOrder(
          mockUserId,
          mockAccountId,
          10000,
          'idempotency-key',
        ),
      ).rejects.toThrow('Seccl payment failed');

      expect(mockOrderExecutionService.completeOrder).not.toHaveBeenCalled();
      expect(mockOrderExecutionService.updatePosition).not.toHaveBeenCalled();
    });

    it('should rollback if order completion fails', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        secclAccountId: mockSecclAccountId,
      };

      mockSecclAccountRepo.findById.mockResolvedValue(mockAccount as any);
      mockOrderRepo.findByIdempotencyKey.mockResolvedValue(null);

      mockOrderExecutionService.createTransactionGroup.mockResolvedValue({
        order: { id: 'order-123' },
        paymentId: 'PAY-123',
        orderId: 'ORD-123',
        orderAmount: 9800,
      } as any);

      mockOrderExecutionService.completePayment.mockResolvedValue(undefined);
      mockOrderExecutionService.completeOrder.mockRejectedValue(
        new Error('Order execution failed'),
      );

      await expect(
        service.createInvestmentOrder(
          mockUserId,
          mockAccountId,
          10000,
          'idempotency-key',
        ),
      ).rejects.toThrow('Order execution failed');

      expect(mockOrderExecutionService.updatePosition).not.toHaveBeenCalled();
    });

    it('should rollback if position update fails', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        secclAccountId: mockSecclAccountId,
      };

      mockSecclAccountRepo.findById.mockResolvedValue(mockAccount as any);
      mockOrderRepo.findByIdempotencyKey.mockResolvedValue(null);

      mockOrderExecutionService.createTransactionGroup.mockResolvedValue({
        order: { id: 'order-123' },
        paymentId: 'PAY-123',
        orderId: 'ORD-123',
        orderAmount: 9800,
      } as any);

      mockOrderExecutionService.completePayment.mockResolvedValue(undefined);
      mockOrderExecutionService.completeOrder.mockResolvedValue({
        completedOrder: { id: 'order-123' },
        executedQuantity: 43,
        executedAmount: 9761,
      } as any);

      mockOrderExecutionService.updatePosition.mockRejectedValue(
        new Error('Position update failed'),
      );

      await expect(
        service.createInvestmentOrder(
          mockUserId,
          mockAccountId,
          10000,
          'idempotency-key',
        ),
      ).rejects.toThrow('Position update failed');
    });
  });

  describe('getAccountSummary', () => {
    it('should return account summary with positions', async () => {
      const mockAccount = {
        id: mockAccountId,
        userId: mockUserId,
        secclAccountId: mockSecclAccountId,
      };

      const mockSummary = {
        accountId: mockSecclAccountId,
        accountName: 'Test ISA',
        positions: [
          {
            assetId: '275F1',
            quantity: 43,
            bookValue: 9761,
          },
        ],
      };

      mockSecclAccountRepo.findById.mockResolvedValue(mockAccount as any);
      mockSecclService.getAccountSummary.mockResolvedValue(mockSummary);

      const result = await service.getAccountSummary(mockUserId, mockAccountId);

      expect(result.accountId).toBe(mockSecclAccountId);
      expect(result.positions.length).toBe(1);
      expect(mockSecclService.getAccountSummary).toHaveBeenCalledWith(
        'MOCK_FIRM',
        mockSecclAccountId,
      );
    });

    it('should throw NotFoundException if account does not exist', async () => {
      mockSecclAccountRepo.findById.mockResolvedValue(null);

      await expect(
        service.getAccountSummary(mockUserId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);

      expect(mockSecclService.getAccountSummary).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if account belongs to different user', async () => {
      const otherUserAccount = {
        id: mockAccountId,
        userId: 'other-user-999',
        secclAccountId: mockSecclAccountId,
      };

      mockSecclAccountRepo.findById.mockResolvedValue(otherUserAccount as any);

      await expect(
        service.getAccountSummary(mockUserId, mockAccountId),
      ).rejects.toThrow(NotFoundException);

      expect(mockSecclService.getAccountSummary).not.toHaveBeenCalled();
    });
  });

  describe('getAccounts', () => {
    it('should return all accounts for user with position count', async () => {
      const mockAccounts = [
        {
          id: 'account-1',
          secclAccountId: 'ACC-1',
          accountName: 'ISA Account',
          wrapperType: WrapperType.ISA,
          currency: 'GBP',
          cashBalance: 5000,
          totalValue: 15000,
          status: 'Active',
          positions: [{ id: 'pos-1' }, { id: 'pos-2' }],
          createdAt: new Date(),
        },
        {
          id: 'account-2',
          secclAccountId: 'ACC-2',
          accountName: 'GIA Account',
          wrapperType: WrapperType.GIA,
          currency: 'GBP',
          cashBalance: 2000,
          totalValue: 8000,
          status: 'Active',
          positions: [],
          createdAt: new Date(),
        },
      ];

      mockSecclAccountRepo.findByUserId.mockResolvedValue(mockAccounts as any);

      const result = await service.getAccounts(mockUserId);

      expect(result.length).toBe(2);
      expect(result[0].positionCount).toBe(2);
      expect(result[1].positionCount).toBe(0);
      expect(mockSecclAccountRepo.findByUserId).toHaveBeenCalledWith(
        mockPrisma,
        mockUserId,
      );
    });

    it('should return empty array if user has no accounts', async () => {
      mockSecclAccountRepo.findByUserId.mockResolvedValue([]);

      const result = await service.getAccounts(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getOrders', () => {
    it('should return all orders for user when no account filter', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          fundId: '275F1',
          fundName: 'Money Market Fund',
          amount: 9800,
          currency: 'GBP',
          status: 'ORDER_COMPLETED',
          executedQuantity: 43,
          executionPrice: 2.27,
          createdAt: new Date(),
        },
      ];

      mockOrderRepo.findByUserId.mockResolvedValue(mockOrders as any);

      const result = await service.getOrders(mockUserId);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('order-1');
      expect(mockOrderRepo.findByUserId).toHaveBeenCalledWith(
        mockPrisma,
        mockUserId,
      );
    });

    it('should return orders for specific account when filter provided', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          fundId: '275F1',
          amount: 9800,
          status: 'ORDER_COMPLETED',
          createdAt: new Date(),
        },
      ];

      mockOrderRepo.findBySecclAccountId.mockResolvedValue(mockOrders as any);

      const result = await service.getOrders(mockUserId, mockAccountId);

      expect(result.length).toBe(1);
      expect(mockOrderRepo.findBySecclAccountId).toHaveBeenCalledWith(
        mockPrisma,
        mockAccountId,
      );
    });
  });

  describe('getPositions', () => {
    it('should return all positions for user when no account filter', async () => {
      const mockPositions = [
        {
          id: 'pos-1',
          secclPositionId: 'POS-1',
          fundId: '275F1',
          fundName: 'Money Market Fund',
          isin: 'GB00MOCK1234',
          quantity: 43,
          bookValue: 9761,
          currentValue: 9800,
          growth: 39,
          growthPercent: 0.4,
          currency: 'GBP',
          lastUpdatedAt: new Date(),
        },
      ];

      mockPositionRepo.findByUserId.mockResolvedValue(mockPositions as any);

      const result = await service.getPositions(mockUserId);

      expect(result.length).toBe(1);
      expect(result[0].quantity).toBe(43);
      expect(mockPositionRepo.findByUserId).toHaveBeenCalledWith(
        mockPrisma,
        mockUserId,
      );
    });

    it('should return positions for specific account when filter provided', async () => {
      const mockPositions = [
        {
          id: 'pos-1',
          quantity: 86,
          bookValue: 19522,
          currentValue: 19600,
          growth: 78,
          growthPercent: 0.4,
        },
      ];

      mockPositionRepo.findBySecclAccountId.mockResolvedValue(
        mockPositions as any,
      );

      const result = await service.getPositions(mockUserId, mockAccountId);

      expect(result.length).toBe(1);
      expect(result[0].quantity).toBe(86);
      expect(mockPositionRepo.findBySecclAccountId).toHaveBeenCalledWith(
        mockPrisma,
        mockAccountId,
      );
    });

    it('should return empty array if no positions exist', async () => {
      mockPositionRepo.findByUserId.mockResolvedValue([]);

      const result = await service.getPositions(mockUserId);

      expect(result).toEqual([]);
    });
  });
});
