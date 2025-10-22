import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SecclService } from '../seccl.service';
import { LoggerService } from '../../common/logging/logger.service';
import { WrapperType } from '../dto/create-account.dto';
import { TransactionType } from '../dto/transaction-group.dto';

describe('SecclService (Mock Mode)', () => {
  let service: SecclService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'SECCL_API_KEY') return undefined; // Force mock mode
        if (key === 'SECCL_BASE_URL') return 'https://mock-seccl.com';
        return undefined;
      }),
    } as any;

    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecclService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<SecclService>(SecclService);
  });

  describe('createAccount', () => {
    it('should create account in mock mode', async () => {
      const dto = {
        firmId: 'FIRM-123',
        nodeId: '0',
        accountType: 'Wrapper',
        name: 'Test ISA',
        status: 'Active',
        currency: 'GBP',
        clientId: 'CLIENT-123',
        wrapperDetail: {
          wrapperType: WrapperType.ISA,
        },
      };

      const result = await service.createAccount(dto);

      expect(result).toHaveProperty('id');
      expect(result.id).toMatch(/^ACC-/);
    });

    it('should generate unique IDs for each account', async () => {
      const dto = {
        firmId: 'FIRM-123',
        nodeId: '0',
        accountType: 'Wrapper',
        name: 'Test GIA',
        status: 'Active',
        currency: 'GBP',
        clientId: 'CLIENT-456',
        wrapperDetail: {
          wrapperType: WrapperType.GIA,
        },
      };

      const result1 = await service.createAccount(dto);
      const result2 = await service.createAccount({ ...dto, clientId: 'CLIENT-789' });

      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('createTransactionGroup', () => {
    it('should create payment + order transaction group', async () => {
      const dto = {
        firmId: 'FIRM-123',
        accountId: 'ACC-123',
        transactions: [
          {
            firmId: 'FIRM-123',
            accountId: 'ACC-123',
            transactionType: TransactionType.Payment,
            transactionSubType: 'Deposit' as any,
            movementType: 'In' as any,
            currency: 'GBP',
            amount: 10000,
            method: 'Bank Transfer',
          },
          {
            firmId: 'FIRM-123',
            accountId: 'ACC-123',
            transactionType: TransactionType.Order,
            transactionSubType: 'At Best' as any,
            movementType: 'Invest' as any,
            currency: 'GBP',
            amount: 9800,
            assetId: '275F1',
          },
        ],
      };

      const result = await service.createTransactionGroup(dto);

      expect(result).toHaveProperty('linkId');
      expect(result.linkId).toMatch(/^TG-/);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].transactionType).toBe(TransactionType.Payment);
      expect(result.transactions[1].transactionType).toBe(TransactionType.Order);
      expect(result.transactions[0].id).toMatch(/^PAY-/);
      expect(result.transactions[1].id).toMatch(/^ORD-/);
    });
  });

  describe('completeTransaction (Payment)', () => {
    it('should complete payment transaction', async () => {
      // First create a transaction group
      const groupDto = {
        firmId: 'FIRM-123',
        accountId: 'ACC-123',
        transactions: [
          {
            firmId: 'FIRM-123',
            accountId: 'ACC-123',
            transactionType: TransactionType.Payment,
            transactionSubType: 'Deposit' as any,
            movementType: 'In' as any,
            currency: 'GBP',
            amount: 10000,
            method: 'Bank Transfer',
          },
        ],
      };

      const group = await service.createTransactionGroup(groupDto);
      const paymentId = group.transactions[0].id;

      // Complete the payment
      const result = await service.completeTransaction('FIRM-123', paymentId, {
        type: 'Action',
        firmId: 'FIRM-123',
        transactionAction: 'Complete',
        actionReason: 'Payment received',
        completedDate: new Date().toISOString(),
      });

      expect(result.id).toBe(paymentId);
      expect(result.status).toBe('Completed');
      expect(result.transactionType).toBe(TransactionType.Payment);
    });
  });

  describe('completeTransaction (Order)', () => {
    it('should complete order transaction with execution details', async () => {
      // Create transaction group
      const groupDto = {
        firmId: 'FIRM-123',
        accountId: 'ACC-123',
        transactions: [
          {
            firmId: 'FIRM-123',
            accountId: 'ACC-123',
            transactionType: TransactionType.Order,
            transactionSubType: 'At Best' as any,
            movementType: 'Invest' as any,
            currency: 'GBP',
            amount: 9800,
            assetId: '275F1',
          },
        ],
      };

      const group = await service.createTransactionGroup(groupDto);
      const orderId = group.transactions[0].id;

      // Complete the order
      const result = await service.completeTransaction('FIRM-123', orderId, {
        type: 'Action',
        firmId: 'FIRM-123',
        transactionAction: 'Complete',
        actionReason: 'Order executed',
        completedDate: new Date().toISOString(),
        executionDetails: {
          currency: 'GBP',
          price: 2.27,
          transactionTime: '00:00:00',
          venue: 'XLON',
          executionAmount: 97.61,
          executedQuantity: 43,
        },
        quantity: 43,
        amount: 97.61,
        transactionDate: new Date().toISOString(),
        intendedSettlementDate: new Date().toISOString(),
      });

      expect(result.id).toBe(orderId);
      expect(result.status).toBe('Completed');
      expect(result.executionDetails).toBeDefined();
      expect(result.executionDetails?.executedQuantity).toBe(43);
    });

    it('should create position after order completion', async () => {
      const accountId = 'ACC-TEST-POS';

      // Create transaction group
      const groupDto = {
        firmId: 'FIRM-123',
        accountId,
        transactions: [
          {
            firmId: 'FIRM-123',
            accountId,
            transactionType: TransactionType.Order,
            transactionSubType: 'At Best' as any,
            movementType: 'Invest' as any,
            currency: 'GBP',
            amount: 9800,
            assetId: '275F1',
          },
        ],
      };

      const group = await service.createTransactionGroup(groupDto);
      const orderId = group.transactions[0].id;

      // Complete order
      await service.completeTransaction('FIRM-123', orderId, {
        type: 'Action',
        firmId: 'FIRM-123',
        transactionAction: 'Complete',
        actionReason: 'Order executed',
        completedDate: new Date().toISOString(),
        executionDetails: {
          currency: 'GBP',
          price: 2.27,
          transactionTime: '00:00:00',
          venue: 'XLON',
          executionAmount: 97.61,
          executedQuantity: 43,
        },
        quantity: 43,
        amount: 97.61,
        transactionDate: new Date().toISOString(),
        intendedSettlementDate: new Date().toISOString(),
      });

      // Verify position was created
      const positionId = `${accountId}|S|275F1`;
      const position = await service.getPosition('FIRM-123', positionId);

      expect(position).toBeDefined();
      expect(position.accountId).toBe(accountId);
      expect(position.assetId).toBe('275F1');
      expect(position.quantity).toBe(43);
    });
  });

  describe('getTransactions', () => {
    it('should retrieve orders by linkId', async () => {
      const groupDto = {
        firmId: 'FIRM-123',
        accountId: 'ACC-123',
        transactions: [
          {
            firmId: 'FIRM-123',
            accountId: 'ACC-123',
            transactionType: TransactionType.Payment,
            transactionSubType: 'Deposit' as any,
            movementType: 'In' as any,
            currency: 'GBP',
            amount: 10000,
            method: 'Bank Transfer',
          },
          {
            firmId: 'FIRM-123',
            accountId: 'ACC-123',
            transactionType: TransactionType.Order,
            transactionSubType: 'At Best' as any,
            movementType: 'Invest' as any,
            currency: 'GBP',
            amount: 9800,
            assetId: '275F1',
          },
        ],
      };

      const group = await service.createTransactionGroup(groupDto);

      // Get only orders
      const orders = await service.getTransactions(
        'FIRM-123',
        group.linkId,
        TransactionType.Order,
      );

      expect(orders).toHaveLength(1);
      expect(orders[0].transactionType).toBe(TransactionType.Order);
      expect(orders[0].linkId).toBe(group.linkId);
    });
  });

  describe('getAccountSummary', () => {
    it('should return account summary with positions', async () => {
      // Create account
      const accountDto = {
        firmId: 'FIRM-123',
        nodeId: '0',
        accountType: 'Wrapper',
        name: 'Test Summary Account',
        status: 'Active',
        currency: 'GBP',
        clientId: 'CLIENT-SUMMARY',
        wrapperDetail: {
          wrapperType: WrapperType.ISA,
        },
      };

      const account = await service.createAccount(accountDto);

      // Create and complete order to generate position
      const groupDto = {
        firmId: 'FIRM-123',
        accountId: account.id,
        transactions: [
          {
            firmId: 'FIRM-123',
            accountId: account.id,
            transactionType: TransactionType.Payment,
            transactionSubType: 'Deposit' as any,
            movementType: 'In' as any,
            currency: 'GBP',
            amount: 10000,
            method: 'Bank Transfer',
          },
          {
            firmId: 'FIRM-123',
            accountId: account.id,
            transactionType: TransactionType.Order,
            transactionSubType: 'At Best' as any,
            movementType: 'Invest' as any,
            currency: 'GBP',
            amount: 9800,
            assetId: '275F1',
          },
        ],
      };

      const group = await service.createTransactionGroup(groupDto);
      const orderId = group.transactions[1].id;

      await service.completeTransaction('FIRM-123', orderId, {
        type: 'Action',
        firmId: 'FIRM-123',
        transactionAction: 'Complete',
        actionReason: 'Order executed',
        completedDate: new Date().toISOString(),
        executionDetails: {
          currency: 'GBP',
          price: 2.27,
          transactionTime: '00:00:00',
          venue: 'XLON',
          executionAmount: 97.61,
          executedQuantity: 43,
        },
        quantity: 43,
        amount: 97.61,
        transactionDate: new Date().toISOString(),
        intendedSettlementDate: new Date().toISOString(),
      });

      // Get account summary
      const summary = await service.getAccountSummary('FIRM-123', account.id);

      expect(summary.accountId).toBe(account.id);
      expect(summary.accountName).toBe(accountDto.name);
      expect(summary.positions).toHaveLength(1);
      expect(summary.positions[0].assetId).toBe('275F1');
      expect(summary.positions[0].quantity).toBe(43);
    });
  });
});
