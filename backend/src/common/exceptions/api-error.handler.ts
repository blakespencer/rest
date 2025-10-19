import { HttpException, HttpStatus } from '@nestjs/common';
import { LoggerService } from '../logging/logger.service';

/**
 * External API error categories
 */
export enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTHENTICATION = 'AUTHENTICATION',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Base exception for external API errors
 */
export class ApiException extends HttpException {
  constructor(
    message: string,
    public readonly apiName: string,
    public readonly errorType: ApiErrorType,
    public readonly originalError?: any,
    statusCode: HttpStatus = HttpStatus.BAD_GATEWAY,
  ) {
    super(
      {
        statusCode,
        message,
        error: `${apiName}ApiError`,
        errorType,
        ...(originalError?.response?.data && {
          details: originalError.response.data,
        }),
      },
      statusCode,
    );
  }
}

/**
 * Centralized API error handler
 * Handles all external API call errors with automatic categorization
 */
export class ApiErrorHandler {
  constructor(
    private readonly logger: LoggerService,
    private readonly apiName: string,
  ) {}

  /**
   * Handle API errors with automatic categorization
   */
  handle(error: unknown, operation: string, context?: Record<string, any>): never {
    const errorType = this.categorizeError(error);

    this.logger.error(`${this.apiName} API error`, {
      operation,
      errorType,
      message: error instanceof Error ? error.message : 'Unknown error',
      statusCode: (error as any)?.response?.status,
      data: (error as any)?.response?.data,
      ...context,
    });

    throw this.createException(error, errorType, operation);
  }

  /**
   * Categorize error based on error properties
   */
  private categorizeError(error: unknown): ApiErrorType {
    if (!error) return ApiErrorType.UNKNOWN;

    const err = error as any;

    // Network errors (no response received)
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
      return ApiErrorType.NETWORK_ERROR;
    }

    // Timeout errors
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return ApiErrorType.TIMEOUT;
    }

    // HTTP response errors
    if (err.response?.status) {
      const status = err.response.status;

      if (status === 401 || status === 403) {
        return ApiErrorType.AUTHENTICATION;
      }
      if (status === 404) {
        return ApiErrorType.NOT_FOUND;
      }
      if (status === 429) {
        return ApiErrorType.RATE_LIMIT;
      }
      if (status >= 400 && status < 500) {
        return ApiErrorType.BAD_REQUEST;
      }
      if (status >= 500) {
        return ApiErrorType.SERVER_ERROR;
      }
    }

    return ApiErrorType.UNKNOWN;
  }

  /**
   * Create appropriate exception based on error type
   */
  private createException(
    error: unknown,
    errorType: ApiErrorType,
    operation: string,
  ): ApiException {
    const err = error as any;
    let message = `${this.apiName} API error`;
    let statusCode = HttpStatus.BAD_GATEWAY;

    switch (errorType) {
      case ApiErrorType.NETWORK_ERROR:
        message = `Cannot connect to ${this.apiName} API`;
        statusCode = HttpStatus.SERVICE_UNAVAILABLE;
        break;

      case ApiErrorType.TIMEOUT:
        message = `${this.apiName} API request timed out`;
        statusCode = HttpStatus.GATEWAY_TIMEOUT;
        break;

      case ApiErrorType.RATE_LIMIT:
        message = `${this.apiName} API rate limit exceeded`;
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
        break;

      case ApiErrorType.AUTHENTICATION:
        message = `${this.apiName} API authentication failed`;
        statusCode = HttpStatus.UNAUTHORIZED;
        break;

      case ApiErrorType.NOT_FOUND:
        message = err.response?.data?.message || `Resource not found in ${this.apiName} API`;
        statusCode = HttpStatus.NOT_FOUND;
        break;

      case ApiErrorType.BAD_REQUEST:
        message = err.response?.data?.message || `Invalid request to ${this.apiName} API`;
        statusCode = HttpStatus.BAD_REQUEST;
        break;

      case ApiErrorType.SERVER_ERROR:
        message = `${this.apiName} API server error`;
        statusCode = HttpStatus.BAD_GATEWAY;
        break;

      case ApiErrorType.UNKNOWN:
        message = err.message || `Unknown ${this.apiName} API error`;
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        break;
    }

    return new ApiException(message, this.apiName, errorType, err, statusCode);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error: unknown): boolean {
    const errorType = this.categorizeError(error);

    // Retry on network errors, timeouts, and server errors
    return [
      ApiErrorType.NETWORK_ERROR,
      ApiErrorType.TIMEOUT,
      ApiErrorType.SERVER_ERROR,
    ].includes(errorType);
  }
}
