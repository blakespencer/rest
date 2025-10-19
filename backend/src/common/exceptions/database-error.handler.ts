import { Prisma } from '@prisma/client';
import { HttpException, HttpStatus } from '@nestjs/common';
import { LoggerService } from '../logging/logger.service';

/**
 * Database-specific exceptions with detailed error information
 */
export class DatabaseException extends HttpException {
  constructor(
    message: string,
    public readonly code: string,
    public readonly operation: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(
      {
        statusCode,
        message,
        error: 'DatabaseError',
        code,
        operation,
      },
      statusCode,
    );
  }
}

export class UniqueConstraintViolationException extends DatabaseException {
  constructor(operation: string, field: string) {
    super(
      `Record with this ${field} already exists`,
      'P2002',
      operation,
      HttpStatus.CONFLICT,
    );
  }
}

export class RecordNotFoundException extends DatabaseException {
  constructor(operation: string, model: string) {
    super(
      `${model} not found`,
      'P2025',
      operation,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ForeignKeyConstraintException extends DatabaseException {
  constructor(operation: string, relation: string) {
    super(
      `Cannot complete operation: related ${relation} does not exist`,
      'P2003',
      operation,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidDataException extends DatabaseException {
  constructor(operation: string, details: string) {
    super(
      `Invalid data: ${details}`,
      'VALIDATION_ERROR',
      operation,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Centralized database error handler
 * Converts Prisma errors into domain exceptions with meaningful messages
 */
export class DatabaseErrorHandler {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Handle Prisma errors and convert to domain exceptions
   */
  handle(error: unknown, operation: string, context?: Record<string, any>): never {
    // Prisma Client Known Request Error (database errors)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error('Database error', {
        operation,
        code: error.code,
        message: error.message,
        meta: error.meta,
        ...context,
      });

      throw this.mapPrismaError(error, operation);
    }

    // Prisma Client Validation Error (query validation)
    if (error instanceof Prisma.PrismaClientValidationError) {
      this.logger.error('Database validation error', {
        operation,
        message: error.message,
        ...context,
      });

      throw new InvalidDataException(operation, 'Invalid query parameters');
    }

    // Prisma Client Initialization Error
    if (error instanceof Prisma.PrismaClientInitializationError) {
      this.logger.error('Database connection error', {
        operation,
        message: error.message,
        ...context,
      });

      throw new DatabaseException(
        'Database connection failed',
        'CONNECTION_ERROR',
        operation,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Unknown error
    this.logger.error('Unknown database error', {
      operation,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ...context,
    });

    throw new DatabaseException(
      'An unexpected database error occurred',
      'UNKNOWN_ERROR',
      operation,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Map Prisma error codes to domain exceptions
   * Reference: https://www.prisma.io/docs/reference/api-reference/error-reference
   */
  private mapPrismaError(
    error: Prisma.PrismaClientKnownRequestError,
    operation: string,
  ): DatabaseException {
    switch (error.code) {
      // P2002: Unique constraint violation
      case 'P2002': {
        const field = this.extractFieldFromMeta(error.meta);
        return new UniqueConstraintViolationException(operation, field);
      }

      // P2025: Record not found (findUniqueOrThrow, update, delete)
      case 'P2025': {
        const model = this.extractModelFromMessage(error.message);
        return new RecordNotFoundException(operation, model);
      }

      // P2003: Foreign key constraint failed
      case 'P2003': {
        const relation = this.extractFieldFromMeta(error.meta);
        return new ForeignKeyConstraintException(operation, relation);
      }

      // P2014: Relation violation (required relation missing)
      case 'P2014':
        return new DatabaseException(
          'Required relation is missing',
          error.code,
          operation,
          HttpStatus.BAD_REQUEST,
        );

      // P2015: Related record not found
      case 'P2015':
        return new DatabaseException(
          'Related record not found',
          error.code,
          operation,
          HttpStatus.NOT_FOUND,
        );

      // P2016: Query interpretation error
      case 'P2016':
        return new DatabaseException(
          'Invalid query',
          error.code,
          operation,
          HttpStatus.BAD_REQUEST,
        );

      // P2021: Table does not exist
      case 'P2021':
        return new DatabaseException(
          'Database table not found',
          error.code,
          operation,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );

      // P2022: Column does not exist
      case 'P2022':
        return new DatabaseException(
          'Database column not found',
          error.code,
          operation,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );

      // Default: Generic database error
      default:
        return new DatabaseException(
          error.message,
          error.code,
          operation,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }

  /**
   * Extract field name from Prisma error metadata
   */
  private extractFieldFromMeta(meta: any): string {
    if (meta?.target && Array.isArray(meta.target)) {
      return meta.target.join(', ');
    }
    if (meta?.field_name) {
      return meta.field_name;
    }
    return 'field';
  }

  /**
   * Extract model name from error message
   */
  private extractModelFromMessage(message: string): string {
    // Try to extract model name from message like "No User found"
    const match = message.match(/No (\w+) found/);
    if (match && match[1]) {
      return match[1];
    }
    return 'Record';
  }
}
