import { Prisma } from '@prisma/client';
import { HttpStatus } from '@nestjs/common';
import {
  DatabaseErrorHandler,
  UniqueConstraintViolationException,
  RecordNotFoundException,
  ForeignKeyConstraintException,
  InvalidDataException,
  DatabaseException,
} from '../database-error.handler';
import { LoggerService } from '../../logging/logger.service';

describe('DatabaseErrorHandler', () => {
  let handler: DatabaseErrorHandler;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
    } as any;

    handler = new DatabaseErrorHandler(mockLogger);
  });

  describe('Prisma error mapping', () => {
    it('should map P2002 (unique constraint) to UniqueConstraintViolationException', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['email'] },
        },
      );

      expect(() => handler.handle(prismaError, 'createUser')).toThrow(
        UniqueConstraintViolationException,
      );

      expect(() => handler.handle(prismaError, 'createUser')).toThrow(
        'Record with this email already exists',
      );
    });

    it('should map P2002 with multiple fields to UniqueConstraintViolationException', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['userId', 'itemId'] },
        },
      );

      expect(() => handler.handle(prismaError, 'createConnection')).toThrow(
        'Record with this userId, itemId already exists',
      );
    });

    it('should map P2025 (record not found) to RecordNotFoundException', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'No User found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        },
      );

      expect(() => handler.handle(prismaError, 'updateUser')).toThrow(
        RecordNotFoundException,
      );

      expect(() => handler.handle(prismaError, 'updateUser')).toThrow(
        'User not found',
      );
    });

    it('should map P2003 (foreign key constraint) to ForeignKeyConstraintException', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '5.0.0',
          meta: { field_name: 'userId' },
        },
      );

      expect(() => handler.handle(prismaError, 'createBankConnection')).toThrow(
        ForeignKeyConstraintException,
      );

      expect(() => handler.handle(prismaError, 'createBankConnection')).toThrow(
        'Cannot complete operation: related userId does not exist',
      );
    });

    it('should map P2014 (relation violation) correctly', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'The change you are trying to make would violate the required relation',
        {
          code: 'P2014',
          clientVersion: '5.0.0',
        },
      );

      expect(() => handler.handle(prismaError, 'updateRelation')).toThrow(
        DatabaseException,
      );

      expect(() => handler.handle(prismaError, 'updateRelation')).toThrow(
        'Required relation is missing',
      );
    });

    it('should map P2021 (table not found) correctly', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'The table does not exist',
        {
          code: 'P2021',
          clientVersion: '5.0.0',
        },
      );

      const error = (() => {
        try {
          handler.handle(prismaError, 'query');
        } catch (e) {
          return e as DatabaseException;
        }
      })();

      expect(error).toBeInstanceOf(DatabaseException);
      expect(error?.code).toBe('P2021');
      expect(error?.operation).toBe('query');
    });

    it('should map unknown Prisma error code to generic DatabaseException', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unknown error',
        {
          code: 'P9999', // Non-existent code
          clientVersion: '5.0.0',
        },
      );

      const error = (() => {
        try {
          handler.handle(prismaError, 'someOperation');
        } catch (e) {
          return e as DatabaseException;
        }
      })();

      expect(error).toBeInstanceOf(DatabaseException);
      expect(error?.code).toBe('P9999');
      expect(error?.operation).toBe('someOperation');
    });
  });

  describe('validation errors', () => {
    it('should map PrismaClientValidationError to InvalidDataException', () => {
      const validationError = new Prisma.PrismaClientValidationError(
        'Invalid query',
        { clientVersion: '5.0.0' },
      );

      expect(() => handler.handle(validationError, 'query')).toThrow(
        InvalidDataException,
      );

      expect(() => handler.handle(validationError, 'query')).toThrow(
        'Invalid data: Invalid query parameters',
      );
    });
  });

  describe('connection errors', () => {
    it('should map PrismaClientInitializationError to connection error', () => {
      const initError = new Prisma.PrismaClientInitializationError(
        'Cannot connect to database',
        '5.0.0',
      );

      const error = (() => {
        try {
          handler.handle(initError, 'connect');
        } catch (e) {
          return e as DatabaseException;
        }
      })();

      expect(error).toBeInstanceOf(DatabaseException);
      expect(error?.code).toBe('CONNECTION_ERROR');
      expect(error?.message).toBe('Database connection failed');
    });
  });

  describe('unknown errors', () => {
    it('should handle generic Error as unknown database error', () => {
      const genericError = new Error('Something went wrong');

      const error = (() => {
        try {
          handler.handle(genericError, 'operation');
        } catch (e) {
          return e as DatabaseException;
        }
      })();

      expect(error).toBeInstanceOf(DatabaseException);
      expect(error?.code).toBe('UNKNOWN_ERROR');
    });

    it('should handle non-Error objects', () => {
      const weirdError = 'string error';

      const error = (() => {
        try {
          handler.handle(weirdError, 'operation');
        } catch (e) {
          return e as DatabaseException;
        }
      })();

      expect(error).toBeInstanceOf(DatabaseException);
      expect(error?.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('logging', () => {
    it('should log Prisma errors with context', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['email'] },
        },
      );

      try {
        handler.handle(prismaError, 'createUser', { userId: '123' });
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Database error',
        expect.objectContaining({
          operation: 'createUser',
          code: 'P2002',
          userId: '123',
        }),
      );
    });

    it('should log validation errors', () => {
      const validationError = new Prisma.PrismaClientValidationError(
        'Invalid field',
        { clientVersion: '5.0.0' },
      );

      try {
        handler.handle(validationError, 'query', { table: 'users' });
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Database validation error',
        expect.objectContaining({
          operation: 'query',
          table: 'users',
        }),
      );
    });
  });

  describe('HTTP status codes', () => {
    it('should return 409 for unique constraint violations', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['email'] },
      });

      const error = (() => {
        try {
          handler.handle(prismaError, 'create');
        } catch (e) {
          return e as UniqueConstraintViolationException;
        }
      })();

      expect(error?.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('should return 404 for record not found', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      const error = (() => {
        try {
          handler.handle(prismaError, 'update');
        } catch (e) {
          return e as RecordNotFoundException;
        }
      })();

      expect(error?.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for foreign key violations', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('', {
        code: 'P2003',
        clientVersion: '5.0.0',
        meta: { field_name: 'userId' },
      });

      const error = (() => {
        try {
          handler.handle(prismaError, 'create');
        } catch (e) {
          return e as ForeignKeyConstraintException;
        }
      })();

      expect(error?.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should return 503 for connection errors', () => {
      const initError = new Prisma.PrismaClientInitializationError('', '5.0.0');

      const error = (() => {
        try {
          handler.handle(initError, 'connect');
        } catch (e) {
          return e as DatabaseException;
        }
      })();

      expect(error?.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });
  });
});
