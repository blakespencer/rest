import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { BankConnectionService } from '../bank-connection.service';
import { BankConnectionExchangeService } from '../bank-connection-exchange.service';
import { BankConnectionSyncService } from '../bank-connection-sync.service';
import { BankConnectionRepository } from '../bank-connection.repository';
import { LoggerService } from '../../common/logging/logger.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BankConnectionService', () => {
  let service: BankConnectionService;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockPrisma: jest.Mocked<PrismaService>;
  let mockExchangeService: jest.Mocked<BankConnectionExchangeService>;
  let mockSyncService: jest.Mocked<BankConnectionSyncService>;
  let mockRepository: jest.Mocked<BankConnectionRepository>;

  beforeEach(() => {
    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    mockPrisma = {
      $transaction: jest.fn(),
    } as any;

    mockExchangeService = {
      exchangePublicToken: jest.fn(),
    } as any;

    mockSyncService = {
      sync: jest.fn(),
    } as any;

    mockRepository = {
      findById: jest.fn(),
      findByUserId: jest.fn(),
      softDelete: jest.fn(),
    } as any;

    service = new BankConnectionService(
      mockLogger,
      mockPrisma,
      mockRepository,
      mockExchangeService,
      mockSyncService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('exchangePublicToken', () => {
    it('should delegate to BankConnectionExchangeService', async () => {
      const userId = 'user-123';
      const publicToken = 'public-sandbox-test';
      const expectedResponse = {
        id: 'conn-123',
        itemId: 'item-123',
        institutionName: 'Test Bank',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        accounts: [],
      } as any;

      mockExchangeService.exchangePublicToken.mockResolvedValue(
        expectedResponse,
      );

      const result = await service.exchangePublicToken(userId, publicToken);

      expect(result).toEqual(expectedResponse);
      expect(mockExchangeService.exchangePublicToken).toHaveBeenCalledWith(
        userId,
        publicToken,
      );
    });
  });

  describe('sync', () => {
    it('should delegate to BankConnectionSyncService', async () => {
      const userId = 'user-123';
      const connectionId = 'conn-123';
      const expectedResponse = {
        id: 'conn-123',
        itemId: 'item-123',
        institutionName: 'Test Bank',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        accounts: [],
      } as any;

      mockSyncService.sync.mockResolvedValue(expectedResponse);

      const result = await service.sync(userId, connectionId);

      expect(result).toEqual(expectedResponse);
      expect(mockSyncService.sync).toHaveBeenCalledWith(userId, connectionId);
    });
  });

  describe('findByUserId', () => {
    it('should return all connections for user', async () => {
      const userId = 'user-123';

      const connections = [
        {
          id: 'conn-1',
          userId,
          accessToken: 'encrypted-1',
          itemId: 'item-1',
          institutionId: 'ins_1',
          institutionName: 'Bank 1',
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
          lastSyncStatus: 'SUCCESS',
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          accounts: [],
        },
        {
          id: 'conn-2',
          userId,
          accessToken: 'encrypted-2',
          itemId: 'item-2',
          institutionId: 'ins_2',
          institutionName: 'Bank 2',
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
          lastSyncStatus: 'SUCCESS',
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          accounts: [],
        },
      ];

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockRepository.findByUserId.mockResolvedValue(connections as any);
        return fn({});
      });

      const result = await service.findByUserId(userId);

      expect(result).toHaveLength(2);
      expect(mockRepository.findByUserId).toHaveBeenCalledWith(
        expect.anything(),
        userId,
      );
    });

    it('should return empty array if user has no connections', async () => {
      const userId = 'user-no-connections';

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockRepository.findByUserId.mockResolvedValue([]);
        return fn({});
      });

      const result = await service.findByUserId(userId);

      expect(result).toHaveLength(0);
      expect(mockRepository.findByUserId).toHaveBeenCalledWith(
        expect.anything(),
        userId,
      );
    });
  });

  describe('findById', () => {
    it('should return connection if user owns it', async () => {
      const userId = 'user-123';
      const connectionId = 'conn-123';

      const connection = {
        id: connectionId,
        userId,
        accessToken: 'encrypted',
        itemId: 'item-123',
        institutionId: 'ins_123',
        institutionName: 'Test Bank',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockRepository.findById.mockResolvedValue(connection as any);
        return fn({});
      });

      const result = await service.findById(userId, connectionId);

      expect(result.id).toBe(connectionId);
      expect(mockRepository.findById).toHaveBeenCalledWith(
        expect.anything(),
        connectionId,
      );
    });

    it('should throw NotFoundException if connection does not exist', async () => {
      const userId = 'user-123';
      const connectionId = 'conn-nonexistent';

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockRepository.findById.mockResolvedValue(null);
        return fn({});
      });

      await expect(
        service.findById(userId, connectionId),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.findById(userId, connectionId),
      ).rejects.toThrow('Bank connection not found');
    });

    it('should throw ForbiddenException if user does not own connection (security)', async () => {
      const userId = 'user-123';
      const connectionId = 'conn-other';

      const otherConnection = {
        id: connectionId,
        userId: 'user-999', // Different user!
        accessToken: 'encrypted',
        itemId: 'item-other',
        institutionId: 'ins_other',
        institutionName: 'Other Bank',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockRepository.findById.mockResolvedValue(otherConnection as any);
        return fn({});
      });

      await expect(
        service.findById(userId, connectionId),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.findById(userId, connectionId),
      ).rejects.toThrow('do not have access');

      // Verify security warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unauthorized access attempt to bank connection',
        expect.objectContaining({
          userId,
          connectionId,
          ownerId: 'user-999',
        }),
      );
    });
  });

  describe('delete', () => {
    it('should soft delete connection if user owns it', async () => {
      const userId = 'user-123';
      const connectionId = 'conn-123';

      const connection = {
        id: connectionId,
        userId,
        accessToken: 'encrypted',
        itemId: 'item-123',
        institutionId: 'ins_123',
        institutionName: 'Test Bank',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockRepository.findById.mockResolvedValue(connection as any);
        mockRepository.softDelete.mockResolvedValue(undefined);
        return fn({});
      });

      await service.delete(userId, connectionId);

      expect(mockRepository.softDelete).toHaveBeenCalledWith(
        expect.anything(),
        connectionId,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bank connection deleted',
        expect.objectContaining({ connectionId }),
      );
    });

    it('should throw NotFoundException if connection does not exist', async () => {
      const userId = 'user-123';
      const connectionId = 'conn-nonexistent';

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockRepository.findById.mockResolvedValue(null);
        return fn({});
      });

      await expect(
        service.delete(userId, connectionId),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user does not own connection (security)', async () => {
      const userId = 'user-123';
      const connectionId = 'conn-other';

      const otherConnection = {
        id: connectionId,
        userId: 'user-999', // Different user!
        accessToken: 'encrypted',
        itemId: 'item-other',
        institutionId: 'ins_other',
        institutionName: 'Other Bank',
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockRepository.findById.mockResolvedValue(otherConnection as any);
        return fn({});
      });

      await expect(
        service.delete(userId, connectionId),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.delete(userId, connectionId),
      ).rejects.toThrow('do not have access');

      // CRITICAL: Should NOT delete
      expect(mockRepository.softDelete).not.toHaveBeenCalled();

      // Verify security warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unauthorized delete attempt on bank connection',
        expect.objectContaining({
          userId,
          connectionId,
          ownerId: 'user-999',
        }),
      );
    });
  });
});
