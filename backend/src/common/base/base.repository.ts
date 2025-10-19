import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logging/logger.service';
import { DatabaseErrorHandler } from '../exceptions/database-error.handler';

@Injectable()
export abstract class BaseRepository {
  protected abstract readonly logger: LoggerService;
  private errorHandler: DatabaseErrorHandler;

  constructor() {
    // Initialize error handler lazily to avoid circular dependency
  }

  /**
   * Initialize error handler (called in child constructor)
   */
  protected initErrorHandler(): void {
    if (!this.errorHandler) {
      this.errorHandler = new DatabaseErrorHandler(this.logger);
    }
  }

  /**
   * Execute database query with automatic error handling
   * Usage: return this.executeQuery('findUser', () => tx.user.findUnique({ where: { id } }))
   */
  protected async executeQuery<T>(
    operation: string,
    query: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    this.initErrorHandler();

    this.logger.debug(`Executing database operation`, {
      repository: this.constructor.name,
      operation,
      ...context,
    });

    try {
      return await query();
    } catch (error) {
      this.errorHandler.handle(error, operation, {
        repository: this.constructor.name,
        ...context,
      });
    }
  }

  /**
   * Execute database query that might return null
   * Throws RecordNotFoundException if result is null
   */
  protected async executeQueryOrThrow<T>(
    operation: string,
    query: () => Promise<T | null>,
    entityName: string,
    context?: Record<string, any>,
  ): Promise<T> {
    const result = await this.executeQuery(operation, query, context);

    if (result === null) {
      this.logger.warn(`${entityName} not found`, {
        repository: this.constructor.name,
        operation,
        ...context,
      });
      throw new Error(`${entityName} not found`);
    }

    return result;
  }

  /**
   * Execute database mutation (create, update, delete)
   * Logs successful mutations for audit trail
   */
  protected async executeMutation<T>(
    operation: string,
    mutation: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    const result = await this.executeQuery(operation, mutation, context);

    this.logger.info(`Database mutation completed`, {
      repository: this.constructor.name,
      operation,
      ...context,
    });

    return result;
  }

  /**
   * Execute bulk operation (createMany, updateMany, deleteMany)
   */
  protected async executeBulkOperation<T>(
    operation: string,
    bulkOp: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    this.initErrorHandler();

    this.logger.debug(`Executing bulk operation`, {
      repository: this.constructor.name,
      operation,
      ...context,
    });

    try {
      const result = await bulkOp();

      this.logger.info(`Bulk operation completed`, {
        repository: this.constructor.name,
        operation,
        ...context,
      });

      return result;
    } catch (error) {
      this.errorHandler.handle(error, operation, {
        repository: this.constructor.name,
        ...context,
      });
    }
  }
}
