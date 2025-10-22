import { Test, TestingModule } from '@nestjs/testing';
import { BankConnectionController } from '../bank-connection.controller';
import { BankConnectionService } from '../bank-connection.service';
import { PlaidService } from '../../plaid/plaid.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PlaidIntegrationException } from '../../plaid/exceptions/plaid-integration.exception';

describe('BankConnectionController', () => {
  let controller: BankConnectionController;
  let mockBankConnectionService: jest.Mocked<BankConnectionService>;
  let mockPlaidService: jest.Mocked<PlaidService>;

  beforeEach(async () => {
    mockBankConnectionService = {
      findByUserId: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      sync: jest.fn(),
      exchangePublicToken: jest.fn(),
    } as any;

    mockPlaidService = {
      createLinkToken: jest.fn(),
      exchangePublicToken: jest.fn(),
      getAccounts: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankConnectionController],
      providers: [
        {
          provide: BankConnectionService,
          useValue: mockBankConnectionService,
        },
        {
          provide: PlaidService,
          useValue: mockPlaidService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BankConnectionController>(BankConnectionController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createLinkToken (Plaid)', () => {
    it('should create link token for authenticated user', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };

      const mockLinkTokenResponse = {
        link_token: 'link-sandbox-abc123',
        expiration: '2025-10-21T12:00:00Z',
        request_id: 'req-456',
      };

      mockPlaidService.createLinkToken.mockResolvedValue(mockLinkTokenResponse as any);

      const result = await controller.createLinkToken(mockRequest);

      expect(result).toEqual({
        linkToken: 'link-sandbox-abc123',
        expiration: '2025-10-21T12:00:00Z',
      });

      // Should NOT expose internal request_id
      expect(result).not.toHaveProperty('request_id');

      expect(mockPlaidService.createLinkToken).toHaveBeenCalledWith('user-123');
    });

    it('should propagate PlaidIntegrationException from service', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };

      mockPlaidService.createLinkToken.mockRejectedValue(
        new PlaidIntegrationException('Plaid API unavailable'),
      );

      await expect(controller.createLinkToken(mockRequest)).rejects.toThrow(
        PlaidIntegrationException,
      );
    });
  });

  describe('exchangePublicToken (Plaid)', () => {
    it('should exchange public token and create bank connection', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const dto = { publicToken: 'public-sandbox-abc123' };

      const mockConnection = {
        id: 'conn-new',
        institutionId: 'ins_109508',
        institutionName: 'Chase',
        status: 'ACTIVE',
        accounts: [
          {
            id: 'acc-1',
            name: 'Checking',
            mask: '1234',
            type: 'depository',
            subtype: 'checking',
          },
        ],
      };

      mockBankConnectionService.exchangePublicToken.mockResolvedValue(mockConnection as any);

      const result = await controller.exchangePublicToken(mockRequest, dto);

      expect(result).toEqual(mockConnection);
      expect(mockBankConnectionService.exchangePublicToken).toHaveBeenCalledWith(
        'user-123',
        'public-sandbox-abc123',
      );
    });

    it('should handle invalid public token from Plaid', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const dto = { publicToken: 'public-sandbox-invalid' };

      mockBankConnectionService.exchangePublicToken.mockRejectedValue(
        new PlaidIntegrationException('Invalid public token'),
      );

      await expect(controller.exchangePublicToken(mockRequest, dto)).rejects.toThrow(
        PlaidIntegrationException,
      );
    });

    it('should handle duplicate item (bank already connected)', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const dto = { publicToken: 'public-sandbox-duplicate' };

      mockBankConnectionService.exchangePublicToken.mockRejectedValue(
        new ConflictException('This bank account is already connected'),
      );

      await expect(controller.exchangePublicToken(mockRequest, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should handle expired public token', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const dto = { publicToken: 'public-sandbox-expired-123456' };

      mockBankConnectionService.exchangePublicToken.mockRejectedValue(
        new PlaidIntegrationException('Public token has expired'),
      );

      await expect(controller.exchangePublicToken(mockRequest, dto)).rejects.toThrow(
        PlaidIntegrationException,
      );
    });
  });

  describe('sync', () => {
    it('should sync bank connection and return updated data', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-123';

      const mockSyncedConnection = {
        id: connectionId,
        institutionId: 'ins_109508',
        institutionName: 'Chase',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        accounts: [
          {
            id: 'acc-1',
            availableBalance: 5000,
            currentBalance: 5100,
          },
        ],
      };

      mockBankConnectionService.sync.mockResolvedValue(mockSyncedConnection as any);

      const result = await controller.sync(mockRequest, connectionId);

      expect(result).toEqual(mockSyncedConnection);
      expect(mockBankConnectionService.sync).toHaveBeenCalledWith('user-123', 'conn-123');
    });

    it('should propagate NotFoundException if connection not found', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-nonexistent';

      mockBankConnectionService.sync.mockRejectedValue(
        new NotFoundException('Bank connection not found'),
      );

      await expect(controller.sync(mockRequest, connectionId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate ForbiddenException if user does not own connection', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-other-user';

      mockBankConnectionService.sync.mockRejectedValue(
        new ForbiddenException('You do not have access to this connection'),
      );

      await expect(controller.sync(mockRequest, connectionId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should handle Plaid errors during sync', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-123';

      mockBankConnectionService.sync.mockRejectedValue(
        new PlaidIntegrationException('Item login required'),
      );

      await expect(controller.sync(mockRequest, connectionId)).rejects.toThrow(
        PlaidIntegrationException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all connections for authenticated user', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };

      const mockConnections = [
        {
          id: 'conn-1',
          institutionId: 'ins_1',
          institutionName: 'Bank 1',
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
          lastSyncStatus: 'SUCCESS',
          createdAt: new Date(),
          accounts: [],
        },
        {
          id: 'conn-2',
          institutionId: 'ins_2',
          institutionName: 'Bank 2',
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
          lastSyncStatus: 'SUCCESS',
          createdAt: new Date(),
          accounts: [],
        },
      ];

      mockBankConnectionService.findByUserId.mockResolvedValue(mockConnections as any);

      const result = await controller.findAll(mockRequest);

      expect(result).toHaveLength(2);
      expect(result).toEqual(mockConnections);

      // CRITICAL: Verify userId from request.user is passed
      expect(mockBankConnectionService.findByUserId).toHaveBeenCalledWith('user-123');
    });

    it('should return empty array if user has no connections', async () => {
      const mockUser = { id: 'user-no-connections', email: 'test@example.com' };
      const mockRequest = { user: mockUser };

      mockBankConnectionService.findByUserId.mockResolvedValue([]);

      const result = await controller.findAll(mockRequest);

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return single connection if user owns it', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-123';

      const mockConnection = {
        id: connectionId,
        institutionId: 'ins_109508',
        institutionName: 'Test Bank',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        createdAt: new Date(),
        accounts: [],
      };

      mockBankConnectionService.findById.mockResolvedValue(mockConnection as any);

      const result = await controller.findOne(mockRequest, connectionId);

      expect(result).toEqual(mockConnection);

      // CRITICAL: Verify both userId and connectionId are passed
      expect(mockBankConnectionService.findById).toHaveBeenCalledWith('user-123', 'conn-123');
    });

    it('should propagate NotFoundException from service', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-nonexistent';

      const notFoundError = new NotFoundException('Bank connection not found');
      mockBankConnectionService.findById.mockRejectedValue(notFoundError);

      await expect(
        controller.findOne(mockRequest, connectionId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException if user does not own connection', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-other-user';

      const forbiddenError = new ForbiddenException(
        'You do not have access to this connection',
      );
      mockBankConnectionService.findById.mockRejectedValue(forbiddenError);

      await expect(
        controller.findOne(mockRequest, connectionId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should soft delete connection if user owns it', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-to-delete';

      mockBankConnectionService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(mockRequest, connectionId);

      // HTTP 204 No Content returns undefined
      expect(result).toBeUndefined();

      // CRITICAL: Verify userId and connectionId are passed
      expect(mockBankConnectionService.delete).toHaveBeenCalledWith('user-123', 'conn-to-delete');
    });

    it('should propagate NotFoundException from service', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-nonexistent';

      const notFoundError = new NotFoundException('Bank connection not found');
      mockBankConnectionService.delete.mockRejectedValue(notFoundError);

      await expect(
        controller.delete(mockRequest, connectionId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ForbiddenException if user does not own connection (security)', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-other-user';

      const forbiddenError = new ForbiddenException(
        'You do not have access to this connection',
      );
      mockBankConnectionService.delete.mockRejectedValue(forbiddenError);

      await expect(
        controller.delete(mockRequest, connectionId),
      ).rejects.toThrow(ForbiddenException);

      // CRITICAL: Verify delete was attempted but rejected by service
      expect(mockBankConnectionService.delete).toHaveBeenCalledWith('user-123', 'conn-other-user');
    });
  });

  describe('JwtAuthGuard', () => {
    it('should be protected by JwtAuthGuard', () => {
      const guards = Reflect.getMetadata('__guards__', BankConnectionController);
      const guardNames = guards.map((guard: any) => guard.name);

      expect(guardNames).toContain('JwtAuthGuard');
    });
  });

  describe('authorization edge cases', () => {
    it('should prevent accessing other users connections via findOne', async () => {
      const attackerUser = { id: 'attacker-123', email: 'attacker@example.com' };
      const mockRequest = { user: attackerUser };
      const victimConnectionId = 'conn-victim';

      const forbiddenError = new ForbiddenException(
        'You do not have access to this connection',
      );
      mockBankConnectionService.findById.mockRejectedValue(forbiddenError);

      await expect(
        controller.findOne(mockRequest, victimConnectionId),
      ).rejects.toThrow(ForbiddenException);

      // Service should have performed ownership check
      expect(mockBankConnectionService.findById).toHaveBeenCalledWith(
        'attacker-123',
        'conn-victim',
      );
    });

    it('should prevent deleting other users connections', async () => {
      const attackerUser = { id: 'attacker-123', email: 'attacker@example.com' };
      const mockRequest = { user: attackerUser };
      const victimConnectionId = 'conn-victim';

      const forbiddenError = new ForbiddenException(
        'You do not have access to this connection',
      );
      mockBankConnectionService.delete.mockRejectedValue(forbiddenError);

      await expect(
        controller.delete(mockRequest, victimConnectionId),
      ).rejects.toThrow(ForbiddenException);

      // Service should have performed ownership check
      expect(mockBankConnectionService.delete).toHaveBeenCalledWith(
        'attacker-123',
        'conn-victim',
      );
    });

    it('should not expose connection details in error for unauthorized access', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockRequest = { user: mockUser };
      const connectionId = 'conn-other';

      // Service throws generic Forbidden, not revealing connection details
      const forbiddenError = new ForbiddenException(
        'You do not have access to this connection',
      );
      mockBankConnectionService.findById.mockRejectedValue(forbiddenError);

      try {
        await controller.findOne(mockRequest, connectionId);
      } catch (error) {
        // Error message should NOT reveal sensitive details
        expect(error.message).not.toContain('itemId');
        expect(error.message).not.toContain('accessToken');
        expect(error.message).not.toContain('user-999'); // Owner's ID
      }
    });
  });
});
