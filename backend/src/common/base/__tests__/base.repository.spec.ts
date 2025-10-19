import { Prisma } from '@prisma/client';
import { BaseRepository } from '../base.repository';
import { LoggerService } from '../../logging/logger.service';
import {
  DatabaseErrorHandler,
  UniqueConstraintViolationException,
  RecordNotFoundException,
} from '../../exceptions/database-error.handler';

// Concrete implementation for testing
class TestRepository extends BaseRepository {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
  }
}

describe('BaseRepository', () => {
  let repository: TestRepository;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    repository = new TestRepository(mockLogger);
  });

  describe('executeQuery', () => {
    it('should execute successful query and log debug', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: '1', name: 'Test' });

      const result = await repository['executeQuery'](
        'findUser',
        queryFn,
        { userId: '1' },
      );

      expect(result).toEqual({ id: '1', name: 'Test' });
      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing database operation',
        expect.objectContaining({
          repository: 'TestRepository',
          operation: 'findUser',
          userId: '1',
        }),
      );
    });

    it('should handle Prisma P2002 error (unique constraint)', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['email'] },
        },
      );

      const queryFn = jest.fn().mockRejectedValue(prismaError);

      await expect(
        repository['executeQuery']('createUser', queryFn),
      ).rejects.toThrow(UniqueConstraintViolationException);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle Prisma P2025 error (record not found)', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'No User found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        },
      );

      const queryFn = jest.fn().mockRejectedValue(prismaError);

      await expect(
        repository['executeQuery']('updateUser', queryFn),
      ).rejects.toThrow(RecordNotFoundException);
    });

    it('should pass context to error handler', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Error', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['email'] },
      });

      const queryFn = jest.fn().mockRejectedValue(prismaError);

      await expect(
        repository['executeQuery']('createUser', queryFn, {
          email: 'test@example.com',
        }),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Database error',
        expect.objectContaining({
          repository: 'TestRepository',
          email: 'test@example.com',
        }),
      );
    });
  });

  describe('executeQueryOrThrow', () => {
    it('should return result if not null', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: '1', name: 'Test' });

      const result = await repository['executeQueryOrThrow'](
        'findUser',
        queryFn,
        'User',
      );

      expect(result).toEqual({ id: '1', name: 'Test' });
    });

    it('should throw error if result is null', async () => {
      const queryFn = jest.fn().mockResolvedValue(null);

      await expect(
        repository['executeQueryOrThrow']('findUser', queryFn, 'User'),
      ).rejects.toThrow('User not found');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'User not found',
        expect.objectContaining({
          repository: 'TestRepository',
          operation: 'findUser',
        }),
      );
    });

    it('should pass context when null', async () => {
      const queryFn = jest.fn().mockResolvedValue(null);

      await expect(
        repository['executeQueryOrThrow'](
          'findUser',
          queryFn,
          'User',
          { userId: '123' },
        ),
      ).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'User not found',
        expect.objectContaining({
          userId: '123',
        }),
      );
    });

    it('should still handle Prisma errors', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Error', {
        code: 'P2003',
        clientVersion: '5.0.0',
        meta: { field_name: 'userId' },
      });

      const queryFn = jest.fn().mockRejectedValue(prismaError);

      await expect(
        repository['executeQueryOrThrow']('findRelated', queryFn, 'Related'),
      ).rejects.toThrow();
    });
  });

  describe('executeMutation', () => {
    it('should execute mutation and log success', async () => {
      const mutationFn = jest.fn().mockResolvedValue({ id: '1', email: 'test@example.com' });

      const result = await repository['executeMutation'](
        'createUser',
        mutationFn,
        { email: 'test@example.com' },
      );

      expect(result).toEqual({ id: '1', email: 'test@example.com' });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Database mutation completed',
        expect.objectContaining({
          repository: 'TestRepository',
          operation: 'createUser',
          email: 'test@example.com',
        }),
      );
    });

    it('should handle errors in mutations', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Error', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['email'] },
      });

      const mutationFn = jest.fn().mockRejectedValue(prismaError);

      await expect(
        repository['executeMutation']('createUser', mutationFn),
      ).rejects.toThrow(UniqueConstraintViolationException);
    });

    it('should not log success if mutation fails', async () => {
      const mutationFn = jest.fn().mockRejectedValue(new Error('Failed'));

      await expect(
        repository['executeMutation']('createUser', mutationFn),
      ).rejects.toThrow();

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('executeBulkOperation', () => {
    it('should execute bulk operation and log', async () => {
      const bulkFn = jest.fn().mockResolvedValue({ count: 10 });

      const result = await repository['executeBulkOperation'](
        'createManyUsers',
        bulkFn,
        { batchSize: 10 },
      );

      expect(result).toEqual({ count: 10 });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing bulk operation',
        expect.objectContaining({
          operation: 'createManyUsers',
          batchSize: 10,
        }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bulk operation completed',
        expect.objectContaining({
          operation: 'createManyUsers',
        }),
      );
    });

    it('should handle errors in bulk operations', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Error', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['email'] },
      });

      const bulkFn = jest.fn().mockRejectedValue(prismaError);

      await expect(
        repository['executeBulkOperation']('createMany', bulkFn),
      ).rejects.toThrow(UniqueConstraintViolationException);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('error handler initialization', () => {
    it('should initialize error handler lazily', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: '1' });

      await repository['executeQuery']('findUser', queryFn);

      expect(repository['errorHandler']).toBeDefined();
    });

    it('should reuse error handler across multiple calls', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: '1' });

      await repository['executeQuery']('findUser1', queryFn);
      const errorHandler1 = repository['errorHandler'];

      await repository['executeQuery']('findUser2', queryFn);
      const errorHandler2 = repository['errorHandler'];

      expect(errorHandler1).toBe(errorHandler2);
    });
  });
});
