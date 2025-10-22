import { Test, TestingModule } from '@nestjs/testing';
import { InvestmentOrderExecutionService } from '../investment-order-execution.service';
import { LoggerService } from '../../common/logging/logger.service';
import { SecclService } from '../../seccl/seccl.service';
import { InvestmentOrderRepository } from '../investment-order.repository';
import { InvestmentPositionRepository } from '../investment-position.repository';
import { TransactionType } from '../../seccl/dto/transaction-group.dto';

/**
 * Investment Order Execution Service Unit Tests
 *
 * CRITICAL: Tests the position accumulation bug fix
 *
 * Battle-tested scenarios:
 * - Position accumulation (multiple orders to same fund)
 * - Share quantity calculation with rounding
 * - Fee calculation (2% fee)
 * - Transaction group creation (payment + order)
 * - Seccl API failure handling
 *
 * NO VANITY TESTS - Every test validates financial calculation accuracy
 */
describe('InvestmentOrderExecutionService', () => {
  let service: InvestmentOrderExecutionService;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockSecclService: jest.Mocked<SecclService>;
  let mockOrderRepo: jest.Mocked<InvestmentOrderRepository>;
  let mockPositionRepo: jest.Mocked<InvestmentPositionRepository>;
  let mockTx: any;

  beforeEach(async () => {
    mockTx = {}; // Mock Prisma transaction client

    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockSecclService = {
      createTransactionGroup: jest.fn(),
      completeTransaction: jest.fn(),
    } as any;

    mockOrderRepo = {
      create: jest.fn(),
      update: jest.fn(),
    } as any;

    mockPositionRepo = {
      findBySecclPositionId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestmentOrderExecutionService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: SecclService, useValue: mockSecclService },
        { provide: InvestmentOrderRepository, useValue: mockOrderRepo },
        { provide: InvestmentPositionRepository, useValue: mockPositionRepo },
      ],
    }).compile();

    service = module.get<InvestmentOrderExecutionService>(
      InvestmentOrderExecutionService,
    );
  });

  describe('createTransactionGroup', () => {
    it('should create payment + order transaction group with 2% fee', async () => {
      const mockResponse = {
        linkId: 'TG-123',
        transactions: [
          {
            id: 'PAY-123',
            transactionType: TransactionType.Payment,
          },
          {
            id: 'ORD-123',
            transactionType: TransactionType.Order,
          },
        ],
      };

      mockSecclService.createTransactionGroup.mockResolvedValue(mockResponse as any);
      mockOrderRepo.create.mockResolvedValue({
        id: 'order-db-123',
        linkId: 'TG-123',
      } as any);

      const result = await service.createTransactionGroup(
        mockTx,
        'account-123',
        'ACC-SECCL-123',
        10000, // £100.00
        'user-123',
        'idempotency-key-123',
      );

      // Verify fee calculation: 10000 * (1 - 0.02) = 9800
      expect(mockSecclService.createTransactionGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              transactionType: TransactionType.Payment,
              amount: 10000, // Full amount
            }),
            expect.objectContaining({
              transactionType: TransactionType.Order,
              amount: 9800, // After 2% fee
            }),
          ]),
        }),
      );

      expect(result.orderAmount).toBe(9800);
      expect(result.paymentId).toBe('PAY-123');
      expect(result.orderId).toBe('ORD-123');
    });

    it('should handle edge case: minimum amount with fee', async () => {
      const mockResponse = {
        linkId: 'TG-MIN',
        transactions: [
          { id: 'PAY-MIN', transactionType: TransactionType.Payment },
          { id: 'ORD-MIN', transactionType: TransactionType.Order },
        ],
      };

      mockSecclService.createTransactionGroup.mockResolvedValue(mockResponse as any);
      mockOrderRepo.create.mockResolvedValue({ id: 'order-min' } as any);

      await service.createTransactionGroup(
        mockTx,
        'account-123',
        'ACC-123',
        100, // £1.00 minimum
        'user-123',
        'key-min',
      );

      // 100 * (1 - 0.02) = 98
      expect(mockSecclService.createTransactionGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({ amount: 100 }),
            expect.objectContaining({ amount: 98 }),
          ]),
        }),
      );
    });

    it('should store order in database with correct fields', async () => {
      const mockResponse = {
        linkId: 'TG-123',
        transactions: [
          { id: 'PAY-123', transactionType: TransactionType.Payment },
          { id: 'ORD-123', transactionType: TransactionType.Order },
        ],
      };

      mockSecclService.createTransactionGroup.mockResolvedValue(mockResponse as any);
      mockOrderRepo.create.mockResolvedValue({ id: 'order-123' } as any);

      await service.createTransactionGroup(
        mockTx,
        'account-456',
        'ACC-789',
        10000,
        'user-789',
        'idempotency-unique',
      );

      expect(mockOrderRepo.create).toHaveBeenCalledWith(mockTx, {
        userId: 'user-789',
        secclAccountId: 'account-456',
        fundId: '275F1',
        fundName: 'Money Market Fund',
        amount: 9800,
        currency: 'GBP',
        idempotencyKey: 'idempotency-unique',
        linkId: 'TG-123',
        paymentId: 'PAY-123',
        orderId: 'ORD-123',
      });
    });

    it('should throw error if Seccl transaction group creation fails', async () => {
      mockSecclService.createTransactionGroup.mockRejectedValue(
        new Error('Seccl API timeout'),
      );

      await expect(
        service.createTransactionGroup(
          mockTx,
          'account-123',
          'ACC-123',
          10000,
          'user-123',
          'key',
        ),
      ).rejects.toThrow('Seccl API timeout');

      expect(mockOrderRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('completePayment', () => {
    it('should complete payment transaction and update order status', async () => {
      mockSecclService.completeTransaction.mockResolvedValue({
        id: 'PAY-123',
        status: 'Completed',
      } as any);

      mockOrderRepo.update.mockResolvedValue({
        id: 'order-123',
        status: 'PAYMENT_COMPLETED',
      } as any);

      await service.completePayment(mockTx, 'order-123', 'PAY-123');

      expect(mockSecclService.completeTransaction).toHaveBeenCalledWith(
        'MOCK_FIRM',
        'PAY-123',
        expect.objectContaining({
          type: 'Action',
          transactionAction: 'Complete',
          actionReason: 'Payment received',
        }),
      );

      expect(mockOrderRepo.update).toHaveBeenCalledWith(mockTx, 'order-123', {
        status: 'PAYMENT_COMPLETED',
      });
    });

    it('should throw error if Seccl payment completion fails', async () => {
      mockSecclService.completeTransaction.mockRejectedValue(
        new Error('Payment processor unavailable'),
      );

      await expect(
        service.completePayment(mockTx, 'order-123', 'PAY-123'),
      ).rejects.toThrow('Payment processor unavailable');

      expect(mockOrderRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('completeOrder - Share Quantity Calculation', () => {
    it('should calculate shares correctly with £98.00 order', async () => {
      // Order amount: £98.00 = 9800 pence
      // Share price: £2.27 = 227 pence
      // Expected shares: floor(9800 / 227) = 43 shares
      // Executed amount: 43 * 227 = 9761 pence

      mockSecclService.completeTransaction.mockResolvedValue({
        id: 'ORD-123',
        status: 'Completed',
      } as any);

      mockOrderRepo.update.mockResolvedValue({
        id: 'order-123',
        executedQuantity: 43,
        executionPrice: 2.27,
      } as any);

      const result = await service.completeOrder(
        mockTx,
        'order-123',
        'ORD-123',
        9800, // £98.00
      );

      expect(result.executedQuantity).toBe(43);
      expect(result.executedAmount).toBe(9761); // 43 * 227 pence

      expect(mockSecclService.completeTransaction).toHaveBeenCalledWith(
        'MOCK_FIRM',
        'ORD-123',
        expect.objectContaining({
          executionDetails: expect.objectContaining({
            price: 2.27,
            executedQuantity: 43,
            executionAmount: 97.61, // In pounds for Seccl API
          }),
          quantity: 43,
          amount: 97.61,
        }),
      );
    });

    it('should handle rounding down for fractional shares', async () => {
      // Order amount: £100.00 = 10000 pence
      // Share price: £2.27 = 227 pence
      // Expected shares: floor(10000 / 227) = 44 shares (not 44.05)
      // Executed amount: 44 * 227 = 9988 pence

      mockSecclService.completeTransaction.mockResolvedValue({} as any);
      mockOrderRepo.update.mockResolvedValue({
        executedQuantity: 44,
      } as any);

      const result = await service.completeOrder(
        mockTx,
        'order-123',
        'ORD-123',
        10000,
      );

      expect(result.executedQuantity).toBe(44); // Rounded down
      expect(result.executedAmount).toBe(9988); // 44 * 227
    });

    it('should handle small order amounts correctly', async () => {
      // Order amount: £1.00 = 100 pence (after 2% fee from £1.02)
      // Share price: £2.27 = 227 pence
      // Expected shares: floor(100 / 227) = 0 shares
      // Executed amount: 0 * 227 = 0 pence

      mockSecclService.completeTransaction.mockResolvedValue({} as any);
      mockOrderRepo.update.mockResolvedValue({ executedQuantity: 0 } as any);

      const result = await service.completeOrder(
        mockTx,
        'order-123',
        'ORD-123',
        100,
      );

      expect(result.executedQuantity).toBe(0);
      expect(result.executedAmount).toBe(0);
    });

    it('should update order with execution details in database', async () => {
      mockSecclService.completeTransaction.mockResolvedValue({} as any);
      mockOrderRepo.update.mockResolvedValue({
        id: 'order-123',
        status: 'ORDER_COMPLETED',
      } as any);

      await service.completeOrder(mockTx, 'order-123', 'ORD-123', 9800);

      expect(mockOrderRepo.update).toHaveBeenCalledWith(
        mockTx,
        'order-123',
        expect.objectContaining({
          status: 'ORDER_COMPLETED',
          executedAt: expect.any(Date),
          executedQuantity: 43,
          executionPrice: 2.27,
          executedAmount: 9761,
        }),
      );
    });
  });

  describe('updatePosition - CRITICAL: Position Accumulation Bug Fix', () => {
    it('should create new position if none exists', async () => {
      mockPositionRepo.findBySecclPositionId.mockResolvedValue(null);
      mockPositionRepo.create.mockResolvedValue({
        id: 'pos-new',
        quantity: 43,
      } as any);

      await service.updatePosition(
        mockTx,
        'user-123',
        'account-456',
        'ACC-SECCL-789',
        43, // 43 shares
        9761, // £97.61
      );

      expect(mockPositionRepo.create).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          userId: 'user-123',
          secclAccountId: 'account-456',
          secclPositionId: 'ACC-SECCL-789|S|275F1',
          fundId: '275F1',
          fundName: 'Money Market Fund',
          quantity: 43,
          bookValue: 9761,
          currentValue: 9761,
          growth: 0,
          growthPercent: 0,
          currency: 'GBP',
        }),
      );

      expect(mockPositionRepo.update).not.toHaveBeenCalled();
    });

    it('should ACCUMULATE shares when position already exists (BUG FIX)', async () => {
      // CRITICAL: This tests the fix for the position accumulation bug
      // User buys 43 shares, then 43 more = should have 86 total, not 43

      const existingPosition = {
        id: 'pos-existing',
        quantity: 43,
        bookValue: 9761,
        currentValue: 9761,
      };

      mockPositionRepo.findBySecclPositionId.mockResolvedValue(
        existingPosition as any,
      );
      mockPositionRepo.update.mockResolvedValue({
        id: 'pos-existing',
        quantity: 86,
      } as any);

      await service.updatePosition(
        mockTx,
        'user-123',
        'account-456',
        'ACC-SECCL-789',
        43, // Adding 43 more shares
        9761, // £97.61 more
      );

      expect(mockPositionRepo.update).toHaveBeenCalledWith(
        mockTx,
        'pos-existing',
        expect.objectContaining({
          quantity: 86, // 43 + 43 = 86 (ACCUMULATED, not replaced)
          bookValue: 19522, // 9761 + 9761
          currentValue: 19522,
          growth: 0,
          growthPercent: 0,
        }),
      );

      expect(mockPositionRepo.create).not.toHaveBeenCalled();
    });

    it('should accumulate correctly over multiple orders', async () => {
      // Simulate 3 orders to the same fund
      let currentPosition = {
        id: 'pos-multi',
        quantity: 0,
        bookValue: 0,
        currentValue: 0,
      };

      // First order: 43 shares
      mockPositionRepo.findBySecclPositionId.mockResolvedValue(null);
      mockPositionRepo.create.mockResolvedValue({
        ...currentPosition,
        quantity: 43,
        bookValue: 9761,
        currentValue: 9761,
      } as any);

      await service.updatePosition(
        mockTx,
        'user-123',
        'account-456',
        'ACC-789',
        43,
        9761,
      );

      // Second order: +43 shares = 86 total
      currentPosition = { id: 'pos-multi', quantity: 43, bookValue: 9761, currentValue: 9761 };
      mockPositionRepo.findBySecclPositionId.mockResolvedValue(
        currentPosition as any,
      );
      mockPositionRepo.update.mockResolvedValue({
        quantity: 86,
        bookValue: 19522,
      } as any);

      await service.updatePosition(
        mockTx,
        'user-123',
        'account-456',
        'ACC-789',
        43,
        9761,
      );

      expect(mockPositionRepo.update).toHaveBeenLastCalledWith(
        mockTx,
        'pos-multi',
        expect.objectContaining({
          quantity: 86,
          bookValue: 19522,
        }),
      );

      // Third order: +44 shares = 130 total
      currentPosition = { id: 'pos-multi', quantity: 86, bookValue: 19522, currentValue: 19522 };
      mockPositionRepo.findBySecclPositionId.mockResolvedValue(
        currentPosition as any,
      );
      mockPositionRepo.update.mockResolvedValue({
        quantity: 130,
        bookValue: 29510,
      } as any);

      await service.updatePosition(
        mockTx,
        'user-123',
        'account-456',
        'ACC-789',
        44,
        9988,
      );

      expect(mockPositionRepo.update).toHaveBeenLastCalledWith(
        mockTx,
        'pos-multi',
        expect.objectContaining({
          quantity: 130, // 86 + 44
          bookValue: 29510, // 19522 + 9988
        }),
      );
    });

    it('should calculate growth correctly after accumulation', async () => {
      const existingPosition = {
        id: 'pos-growth',
        quantity: 43,
        bookValue: 9761,
        currentValue: 9800, // Slight increase
      };

      mockPositionRepo.findBySecclPositionId.mockResolvedValue(
        existingPosition as any,
      );
      mockPositionRepo.update.mockResolvedValue({} as any);

      await service.updatePosition(
        mockTx,
        'user-123',
        'account-456',
        'ACC-789',
        43,
        9761,
      );

      // New totals: bookValue 19522, currentValue 19561
      // Growth: 19561 - 19522 = 39
      // Growth %: (39 / 19522) * 100 = 0.199...

      expect(mockPositionRepo.update).toHaveBeenCalledWith(
        mockTx,
        'pos-growth',
        expect.objectContaining({
          quantity: 86,
          bookValue: 19522,
          currentValue: 19561,
          growth: 39,
          growthPercent: expect.any(Number),
        }),
      );

      const updateCall = mockPositionRepo.update.mock.calls[0][2];
      expect(updateCall.growthPercent).toBeCloseTo(0.199, 2);
    });

    it('should handle zero growth correctly', async () => {
      const existingPosition = {
        id: 'pos-zero',
        quantity: 50,
        bookValue: 11350,
        currentValue: 11350,
      };

      mockPositionRepo.findBySecclPositionId.mockResolvedValue(
        existingPosition as any,
      );
      mockPositionRepo.update.mockResolvedValue({} as any);

      await service.updatePosition(
        mockTx,
        'user-123',
        'account-456',
        'ACC-789',
        50,
        11350,
      );

      expect(mockPositionRepo.update).toHaveBeenCalledWith(
        mockTx,
        'pos-zero',
        expect.objectContaining({
          growth: 0,
          growthPercent: 0,
        }),
      );
    });

    it('should generate correct Seccl position ID format', async () => {
      mockPositionRepo.findBySecclPositionId.mockResolvedValue(null);
      mockPositionRepo.create.mockResolvedValue({} as any);

      await service.updatePosition(
        mockTx,
        'user-123',
        'account-456',
        'ACC-SECCL-XYZ',
        43,
        9761,
      );

      expect(mockPositionRepo.create).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          secclPositionId: 'ACC-SECCL-XYZ|S|275F1', // Format: {accountId}|S|{fundId}
        }),
      );
    });
  });
});
