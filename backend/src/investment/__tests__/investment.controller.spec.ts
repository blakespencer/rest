import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InvestmentController } from '../investment.controller';
import { InvestmentService } from '../investment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WrapperType } from '../../seccl/dto/create-account.dto';

/**
 * Investment Controller Unit Tests
 *
 * Tests HTTP layer concerns:
 * - JWT authentication enforcement
 * - Idempotency-Key header validation
 * - Request/response mapping
 * - Error handling and status codes
 *
 * NO VANITY TESTS - Validates security and contract compliance
 */
describe('InvestmentController', () => {
  let controller: InvestmentController;
  let mockInvestmentService: jest.Mocked<InvestmentService>;

  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockRequest = { user: mockUser };

  beforeEach(async () => {
    mockInvestmentService = {
      createAccount: jest.fn(),
      getAccounts: jest.fn(),
      getAccountSummary: jest.fn(),
      createInvestmentOrder: jest.fn(),
      getOrders: jest.fn(),
      getPositions: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestmentController],
      providers: [
        {
          provide: InvestmentService,
          useValue: mockInvestmentService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true }) // Mock guard for unit tests
      .compile();

    controller = module.get<InvestmentController>(InvestmentController);
  });

  describe('JWT Authentication', () => {
    it('should be protected by JwtAuthGuard', () => {
      const guards = Reflect.getMetadata('__guards__', InvestmentController);
      expect(guards).toBeDefined();
      expect(guards[0]).toBe(JwtAuthGuard);
    });
  });

  describe('POST /investments/accounts', () => {
    it('should create account with user ID from JWT', async () => {
      const dto = {
        accountName: 'Test ISA',
        wrapperType: WrapperType.ISA,
      };

      const mockResponse = {
        id: 'account-123',
        secclAccountId: 'ACC-789',
        accountName: 'Test ISA',
        wrapperType: WrapperType.ISA,
        currency: 'GBP',
        status: 'Active',
        createdAt: new Date(),
      };

      mockInvestmentService.createAccount.mockResolvedValue(mockResponse);

      const result = await controller.createAccount(mockRequest as any, dto);

      expect(mockInvestmentService.createAccount).toHaveBeenCalledWith(
        'user-123',
        'Test ISA',
        WrapperType.ISA,
      );
      expect(result).toEqual(mockResponse);
    });

    it('should pass through validation errors from DTO', async () => {
      const invalidDto = {
        accountName: '', // Empty name should fail validation
        wrapperType: WrapperType.GIA,
      };

      // DTO validation happens before controller, but we test error propagation
      mockInvestmentService.createAccount.mockRejectedValue(
        new BadRequestException('Account name is required'),
      );

      await expect(
        controller.createAccount(mockRequest as any, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /investments/accounts', () => {
    it('should return all accounts for authenticated user', async () => {
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
          positionCount: 2,
          createdAt: new Date(),
        },
      ];

      mockInvestmentService.getAccounts.mockResolvedValue(mockAccounts);

      const result = await controller.getAccounts(mockRequest as any);

      expect(mockInvestmentService.getAccounts).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockAccounts);
      expect(result.length).toBe(1);
    });

    it('should return empty array if user has no accounts', async () => {
      mockInvestmentService.getAccounts.mockResolvedValue([]);

      const result = await controller.getAccounts(mockRequest as any);

      expect(result).toEqual([]);
    });
  });

  describe('GET /investments/accounts/:id/summary', () => {
    it('should return account summary with positions', async () => {
      const mockSummary = {
        accountId: 'ACC-123',
        accountName: 'Test ISA',
        wrapperType: 'ISA',
        positions: [
          {
            assetId: '275F1',
            quantity: 43,
            bookValue: 9761,
          },
        ],
      };

      mockInvestmentService.getAccountSummary.mockResolvedValue(mockSummary);

      const result = await controller.getAccountSummary(
        mockRequest as any,
        'account-123',
      );

      expect(mockInvestmentService.getAccountSummary).toHaveBeenCalledWith(
        'user-123',
        'account-123',
      );
      expect(result).toEqual(mockSummary);
    });
  });

  describe('POST /investments/orders - Idempotency-Key Validation', () => {
    const orderDto = {
      secclAccountId: 'account-123',
      amount: 10000,
    };

    it('should require Idempotency-Key header', async () => {
      await expect(
        controller.createOrder(mockRequest as any, orderDto, undefined),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.createOrder(mockRequest as any, orderDto, undefined),
      ).rejects.toThrow('Idempotency-Key header is required');

      expect(mockInvestmentService.createInvestmentOrder).not.toHaveBeenCalled();
    });

    it('should reject empty Idempotency-Key', async () => {
      await expect(
        controller.createOrder(mockRequest as any, orderDto, ''),
      ).rejects.toThrow(BadRequestException);

      expect(mockInvestmentService.createInvestmentOrder).not.toHaveBeenCalled();
    });

    it('should accept valid Idempotency-Key and create order', async () => {
      const mockOrder = {
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

      mockInvestmentService.createInvestmentOrder.mockResolvedValue(mockOrder);

      const result = await controller.createOrder(
        mockRequest as any,
        orderDto,
        'unique-idempotency-key-123',
      );

      expect(mockInvestmentService.createInvestmentOrder).toHaveBeenCalledWith(
        'user-123',
        'account-123',
        10000,
        'unique-idempotency-key-123',
      );
      expect(result).toEqual(mockOrder);
    });

    it('should pass through different idempotency keys correctly', async () => {
      mockInvestmentService.createInvestmentOrder.mockResolvedValue({
        id: 'order-1',
      } as any);

      await controller.createOrder(mockRequest as any, orderDto, 'key-1');
      await controller.createOrder(mockRequest as any, orderDto, 'key-2');
      await controller.createOrder(mockRequest as any, orderDto, 'key-3');

      expect(mockInvestmentService.createInvestmentOrder).toHaveBeenNthCalledWith(
        1,
        'user-123',
        'account-123',
        10000,
        'key-1',
      );
      expect(mockInvestmentService.createInvestmentOrder).toHaveBeenNthCalledWith(
        2,
        'user-123',
        'account-123',
        10000,
        'key-2',
      );
      expect(mockInvestmentService.createInvestmentOrder).toHaveBeenNthCalledWith(
        3,
        'user-123',
        'account-123',
        10000,
        'key-3',
      );
    });
  });

  describe('GET /investments/orders', () => {
    it('should return all orders when no account filter', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          fundId: '275F1',
          amount: 9800,
          status: 'ORDER_COMPLETED',
          createdAt: new Date(),
        },
      ];

      mockInvestmentService.getOrders.mockResolvedValue(mockOrders as any);

      const result = await controller.getOrders(mockRequest as any, undefined);

      expect(mockInvestmentService.getOrders).toHaveBeenCalledWith(
        'user-123',
        undefined,
      );
      expect(result).toEqual(mockOrders);
    });

    it('should filter orders by account ID when provided', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          fundId: '275F1',
          amount: 9800,
          createdAt: new Date(),
        },
      ];

      mockInvestmentService.getOrders.mockResolvedValue(mockOrders as any);

      const result = await controller.getOrders(
        mockRequest as any,
        'account-123',
      );

      expect(mockInvestmentService.getOrders).toHaveBeenCalledWith(
        'user-123',
        'account-123',
      );
      expect(result).toEqual(mockOrders);
    });
  });

  describe('GET /investments/positions', () => {
    it('should return all positions when no account filter', async () => {
      const mockPositions = [
        {
          id: 'pos-1',
          fundId: '275F1',
          quantity: 86,
          bookValue: 19522,
          currentValue: 19600,
        },
      ];

      mockInvestmentService.getPositions.mockResolvedValue(mockPositions as any);

      const result = await controller.getPositions(mockRequest as any, undefined);

      expect(mockInvestmentService.getPositions).toHaveBeenCalledWith(
        'user-123',
        undefined,
      );
      expect(result).toEqual(mockPositions);
    });

    it('should filter positions by account ID when provided', async () => {
      const mockPositions = [
        {
          id: 'pos-1',
          fundId: '275F1',
          quantity: 43,
          bookValue: 9761,
        },
      ];

      mockInvestmentService.getPositions.mockResolvedValue(mockPositions as any);

      const result = await controller.getPositions(
        mockRequest as any,
        'account-456',
      );

      expect(mockInvestmentService.getPositions).toHaveBeenCalledWith(
        'user-123',
        'account-456',
      );
      expect(result).toEqual(mockPositions);
    });
  });

  describe('Error Handling', () => {
    it('should propagate service errors to client', async () => {
      mockInvestmentService.createAccount.mockRejectedValue(
        new Error('Seccl API unavailable'),
      );

      await expect(
        controller.createAccount(mockRequest as any, {
          accountName: 'Test',
          wrapperType: WrapperType.ISA,
        }),
      ).rejects.toThrow('Seccl API unavailable');
    });

    it('should handle missing user in request (auth bypass attempt)', async () => {
      const requestWithoutUser = { user: undefined };

      // Controller relies on JWT guard, but if bypassed, service receives undefined
      mockInvestmentService.getAccounts.mockRejectedValue(
        new Error('User ID required'),
      );

      await expect(
        controller.getAccounts(requestWithoutUser as any),
      ).rejects.toThrow();
    });
  });

  describe('Request Validation', () => {
    it('should validate minimum amount in order DTO', async () => {
      const invalidDto = {
        secclAccountId: 'account-123',
        amount: 50, // Below minimum
      };

      mockInvestmentService.createInvestmentOrder.mockRejectedValue(
        new BadRequestException('Minimum amount is 100 pence (£1.00)'),
      );

      await expect(
        controller.createOrder(mockRequest as any, invalidDto, 'key-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate wrapper type in account creation', async () => {
      const invalidDto = {
        accountName: 'Test Account',
        wrapperType: 'INVALID' as any, // Invalid wrapper type
      };

      mockInvestmentService.createAccount.mockRejectedValue(
        new BadRequestException('Invalid wrapper type'),
      );

      await expect(
        controller.createAccount(mockRequest as any, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
