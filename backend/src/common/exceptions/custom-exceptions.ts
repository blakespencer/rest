import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * External integration exceptions
 */
export class PlaidIntegrationException extends HttpException {
  constructor(message: string, public readonly originalError?: any) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        message,
        error: 'PlaidIntegrationError',
        errorCode: originalError?.response?.data?.error_code,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

export class SecclIntegrationException extends HttpException {
  constructor(message: string, public readonly originalError?: any) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        message,
        error: 'SecclIntegrationError',
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/**
 * Business logic exceptions
 */
export class InsufficientFundsException extends HttpException {
  constructor(accountId: string, requested: number, available: number) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Insufficient funds for investment order',
        error: 'InsufficientFunds',
        details: {
          accountId,
          requested,
          available,
          shortfall: requested - available,
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class DuplicateResourceException extends HttpException {
  constructor(resourceType: string, identifier: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message: `${resourceType} already exists`,
        error: 'DuplicateResource',
        details: { resourceType, identifier },
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class ResourceNotFoundException extends HttpException {
  constructor(resourceType: string, identifier: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: `${resourceType} not found`,
        error: 'ResourceNotFound',
        details: { resourceType, identifier },
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Security exceptions
 */
export class InvalidIdempotencyKeyException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Idempotency-Key header is required for financial operations',
        error: 'InvalidIdempotencyKey',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
