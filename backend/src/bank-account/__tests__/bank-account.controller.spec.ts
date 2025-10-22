import { Test, TestingModule } from '@nestjs/testing';
import { BankAccountController } from '../bank-account.controller';
import { BankAccountService } from '../bank-account.service';
import { BankAccountResponseDto, ConsolidatedBalanceDto } from '../dto/bank-account-response.dto';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('BankAccountController', () => {
  let controller: BankAccountController;
  let service: jest.Mocked<BankAccountService>;

  const mockUserId = 'user-123';
  const mockRequest = {
    user: {
      id: mockUserId,
      email: 'test@example.com',
      name: 'Test User',
    },
  };

  const mockBankAccountDto: BankAccountResponseDto = {
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

  const mockConsolidatedBalanceDto: ConsolidatedBalanceDto = {
    totalAvailable: 28500,
    totalCurrent: 30000,
    currency: 'USD',
    accountCount: 2,
    accounts: [
      {
        id: 'acc-123',
        name: 'Checking',
        mask: '1234',
        availableBalance: 9500,
        currentBalance: 10000,
      },
      {
        id: 'acc-456',
        name: 'Savings',
        mask: '5678',
        availableBalance: 19000,
        currentBalance: 20000,
      },
    ],
  };

  beforeEach(async () => {
    service = {
      findByUserId: jest.fn(),
      findById: jest.fn(),
      getConsolidatedBalance: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankAccountController],
      providers: [
        {
          provide: BankAccountService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<BankAccountController>(BankAccountController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all bank accounts for authenticated user', async () => {
      const mockAccounts = [mockBankAccountDto];
      service.findByUserId.mockResolvedValue(mockAccounts);

      const result = await controller.findAll(mockRequest);

      expect(result).toEqual(mockAccounts);
      expect(service.findByUserId).toHaveBeenCalledWith(mockUserId);
    });

    it('should return empty array when user has no accounts', async () => {
      service.findByUserId.mockResolvedValue([]);

      const result = await controller.findAll(mockRequest);

      expect(result).toEqual([]);
      expect(service.findByUserId).toHaveBeenCalledWith(mockUserId);
    });

    it('should handle multiple accounts', async () => {
      const mockAccounts = [
        mockBankAccountDto,
        { ...mockBankAccountDto, id: 'acc-456', name: 'Savings' },
        { ...mockBankAccountDto, id: 'acc-789', name: 'Credit Card' },
      ];
      service.findByUserId.mockResolvedValue(mockAccounts);

      const result = await controller.findAll(mockRequest);

      expect(result).toHaveLength(3);
      expect(service.findByUserId).toHaveBeenCalledWith(mockUserId);
    });

    it('should use user ID from JWT token', async () => {
      service.findByUserId.mockResolvedValue([]);

      await controller.findAll(mockRequest);

      expect(service.findByUserId).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('findOne', () => {
    it('should return single account when user owns it', async () => {
      service.findById.mockResolvedValue(mockBankAccountDto);

      const result = await controller.findOne(mockRequest, 'acc-123');

      expect(result).toEqual(mockBankAccountDto);
      expect(service.findById).toHaveBeenCalledWith(mockUserId, 'acc-123');
    });

    it('should throw NotFoundException when account does not exist', async () => {
      service.findById.mockRejectedValue(new NotFoundException('Bank account not found'));

      await expect(controller.findOne(mockRequest, 'acc-999')).rejects.toThrow(
        NotFoundException,
      );
      expect(service.findById).toHaveBeenCalledWith(mockUserId, 'acc-999');
    });

    it('should throw ForbiddenException when user does not own account', async () => {
      service.findById.mockRejectedValue(
        new ForbiddenException('You do not have access to this bank account'),
      );

      await expect(controller.findOne(mockRequest, 'acc-123')).rejects.toThrow(
        ForbiddenException,
      );
      expect(service.findById).toHaveBeenCalledWith(mockUserId, 'acc-123');
    });

    it('should handle valid UUID account IDs', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      service.findById.mockResolvedValue({
        ...mockBankAccountDto,
        id: validUuid,
      });

      const result = await controller.findOne(mockRequest, validUuid);

      expect(result.id).toBe(validUuid);
      expect(service.findById).toHaveBeenCalledWith(mockUserId, validUuid);
    });
  });

  describe('getConsolidatedBalance', () => {
    it('should return consolidated balance with default currency (USD)', async () => {
      service.getConsolidatedBalance.mockResolvedValue(mockConsolidatedBalanceDto);

      const result = await controller.getConsolidatedBalance(mockRequest);

      expect(result).toEqual(mockConsolidatedBalanceDto);
      expect(result.currency).toBe('USD');
      expect(result.accountCount).toBe(2);
      expect(result.totalCurrent).toBe(30000);
      expect(result.totalAvailable).toBe(28500);
      expect(service.getConsolidatedBalance).toHaveBeenCalledWith(mockUserId, 'USD');
    });

    it('should return consolidated balance for specified currency', async () => {
      const eurBalance: ConsolidatedBalanceDto = {
        ...mockConsolidatedBalanceDto,
        currency: 'EUR',
        totalCurrent: 50000,
        totalAvailable: 48000,
      };
      service.getConsolidatedBalance.mockResolvedValue(eurBalance);

      const result = await controller.getConsolidatedBalance(mockRequest, 'EUR');

      expect(result.currency).toBe('EUR');
      expect(service.getConsolidatedBalance).toHaveBeenCalledWith(mockUserId, 'EUR');
    });

    it('should return zero balances when no accounts exist', async () => {
      const emptyBalance: ConsolidatedBalanceDto = {
        totalAvailable: 0,
        totalCurrent: 0,
        currency: 'USD',
        accountCount: 0,
        accounts: [],
      };
      service.getConsolidatedBalance.mockResolvedValue(emptyBalance);

      const result = await controller.getConsolidatedBalance(mockRequest);

      expect(result.totalCurrent).toBe(0);
      expect(result.totalAvailable).toBe(0);
      expect(result.accountCount).toBe(0);
      expect(result.accounts).toEqual([]);
    });

    it('should handle uppercase currency codes', async () => {
      service.getConsolidatedBalance.mockResolvedValue({
        ...mockConsolidatedBalanceDto,
        currency: 'GBP',
      });

      await controller.getConsolidatedBalance(mockRequest, 'GBP');

      expect(service.getConsolidatedBalance).toHaveBeenCalledWith(mockUserId, 'GBP');
    });

    it('should handle lowercase currency codes', async () => {
      service.getConsolidatedBalance.mockResolvedValue({
        ...mockConsolidatedBalanceDto,
        currency: 'cad',
      });

      await controller.getConsolidatedBalance(mockRequest, 'cad');

      expect(service.getConsolidatedBalance).toHaveBeenCalledWith(mockUserId, 'cad');
    });

    it('should include account summaries with masked data only', async () => {
      service.getConsolidatedBalance.mockResolvedValue(mockConsolidatedBalanceDto);

      const result = await controller.getConsolidatedBalance(mockRequest);

      expect(result.accounts[0]).toEqual({
        id: 'acc-123',
        name: 'Checking',
        mask: '1234',
        availableBalance: 9500,
        currentBalance: 10000,
      });
      // Should not include sensitive fields like plaidAccountId, officialName, etc.
      expect(result.accounts[0]).not.toHaveProperty('plaidAccountId');
      expect(result.accounts[0]).not.toHaveProperty('officialName');
    });

    it('should aggregate balances across multiple accounts', async () => {
      service.getConsolidatedBalance.mockResolvedValue(mockConsolidatedBalanceDto);

      const result = await controller.getConsolidatedBalance(mockRequest);

      expect(result.accountCount).toBe(2);
      expect(result.accounts).toHaveLength(2);
      expect(result.totalCurrent).toBe(
        result.accounts.reduce((sum, acc) => sum + acc.currentBalance, 0),
      );
    });
  });

  describe('JWT Authentication', () => {
    it('should extract user ID from JWT token in request', async () => {
      service.findByUserId.mockResolvedValue([]);

      await controller.findAll(mockRequest);

      expect(service.findByUserId).toHaveBeenCalledWith(mockUserId);
    });

    it('should handle request without user (guard should prevent this)', async () => {
      const requestWithoutUser = { user: undefined };
      service.findByUserId.mockResolvedValue([]);

      await controller.findAll(requestWithoutUser);

      expect(service.findByUserId).toHaveBeenCalledWith(undefined);
    });
  });
});
