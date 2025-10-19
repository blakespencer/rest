import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { LoggerService } from '../logging/logger.service';
import { ApiErrorHandler } from '../exceptions/api-error.handler';

export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  onlyRetryIf?: (error: unknown) => boolean;
}

@Injectable()
export abstract class BaseService {
  protected abstract readonly logger: LoggerService;
  protected abstract readonly prisma: PrismaClient;

  /**
   * Execute operation within a database transaction
   * Automatically handles rollback on error
   */
  protected async executeInTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        return await operation(tx);
      });
    } catch (error) {
      this.logger.error('Transaction failed', {
        service: this.constructor.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Execute external API call with automatic error handling
   * Usage: return this.executeApiCall('Plaid', 'getAccounts', () => plaidApi.getAccounts())
   */
  protected async executeApiCall<T>(
    apiName: string,
    operation: string,
    apiCall: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    const errorHandler = new ApiErrorHandler(this.logger, apiName);

    this.logger.debug(`Executing ${apiName} API call`, {
      service: this.constructor.name,
      operation,
      ...context,
    });

    try {
      const result = await apiCall();

      this.logger.info(`${apiName} API call successful`, {
        service: this.constructor.name,
        operation,
        ...context,
      });

      return result;
    } catch (error) {
      // errorHandler.handle always throws, but TypeScript doesn't know that
      errorHandler.handle(error, operation, {
        service: this.constructor.name,
        ...context,
      });
      throw error; // This line is never reached but satisfies TypeScript
    }
  }

  /**
   * Execute API call with automatic retry on transient failures
   * Usage: return this.executeApiCallWithRetry('Plaid', 'getAccounts', () => plaidApi.getAccounts())
   */
  protected async executeApiCallWithRetry<T>(
    apiName: string,
    operation: string,
    apiCall: () => Promise<T>,
    options: RetryOptions = {},
    context?: Record<string, any>,
  ): Promise<T> {
    const errorHandler = new ApiErrorHandler(this.logger, apiName);
    const {
      retries = 3,
      factor = 2,
      minTimeout = 1000,
      maxTimeout = 10000,
      onlyRetryIf,
    } = options;

    let attempt = 0;

    while (attempt <= retries) {
      try {
        const result = await apiCall();

        if (attempt > 0) {
          this.logger.info(`${apiName} API call succeeded after retry`, {
            service: this.constructor.name,
            operation,
            attempt,
            ...context,
          });
        }

        return result;
      } catch (error) {
        attempt++;

        // Check if we should retry
        const shouldRetry = onlyRetryIf
          ? onlyRetryIf(error)
          : errorHandler.isRetryable(error);

        if (attempt > retries || !shouldRetry) {
          this.logger.error(`${apiName} API call failed`, {
            service: this.constructor.name,
            operation,
            attempts: attempt,
            retryable: shouldRetry,
            ...context,
          });

          errorHandler.handle(error, operation, {
            service: this.constructor.name,
            attempts: attempt,
            ...context,
          });
        }

        // Calculate exponential backoff
        const timeout = Math.min(
          minTimeout * Math.pow(factor, attempt - 1),
          maxTimeout,
        );

        this.logger.warn(`Retrying ${apiName} API call`, {
          service: this.constructor.name,
          operation,
          attempt,
          nextRetryIn: timeout,
          error: error instanceof Error ? error.message : 'Unknown error',
          ...context,
        });

        await this.sleep(timeout);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected retry loop exit');
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
