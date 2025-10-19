import { HttpStatus } from '@nestjs/common';
import {
  ApiErrorHandler,
  ApiException,
  ApiErrorType,
} from '../api-error.handler';
import { LoggerService } from '../../logging/logger.service';

describe('ApiErrorHandler', () => {
  let handler: ApiErrorHandler;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
    } as any;

    handler = new ApiErrorHandler(mockLogger, 'Plaid');
  });

  describe('error categorization', () => {
    it('should categorize ECONNREFUSED as NETWORK_ERROR', () => {
      const error = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };

      expect(handler.isRetryable(error)).toBe(true);

      try {
        handler.handle(error, 'getAccounts');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.errorType).toBe(ApiErrorType.NETWORK_ERROR);
      }
    });

    it('should categorize ENOTFOUND as NETWORK_ERROR', () => {
      const error = {
        code: 'ENOTFOUND',
        message: 'DNS lookup failed',
      };

      expect(handler.isRetryable(error)).toBe(true);
    });

    it('should categorize ETIMEDOUT as TIMEOUT', () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'Request timed out',
      };

      expect(handler.isRetryable(error)).toBe(true);

      try {
        handler.handle(error, 'getTransactions');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.errorType).toBe(ApiErrorType.TIMEOUT);
      }
    });

    it('should categorize 401 as AUTHENTICATION', () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Invalid credentials' },
        },
      };

      expect(handler.isRetryable(error)).toBe(false);

      try {
        handler.handle(error, 'makeRequest');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.errorType).toBe(ApiErrorType.AUTHENTICATION);
        expect(apiError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('should categorize 403 as AUTHENTICATION', () => {
      const error = {
        response: {
          status: 403,
          data: { message: 'Forbidden' },
        },
      };

      expect(handler.isRetryable(error)).toBe(false);
    });

    it('should categorize 404 as NOT_FOUND', () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Resource not found' },
        },
      };

      expect(handler.isRetryable(error)).toBe(false);

      try {
        handler.handle(error, 'getItem');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.errorType).toBe(ApiErrorType.NOT_FOUND);
        expect(apiError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should categorize 429 as RATE_LIMIT', () => {
      const error = {
        response: {
          status: 429,
          data: { message: 'Too many requests' },
        },
      };

      expect(handler.isRetryable(error)).toBe(false);

      try {
        handler.handle(error, 'bulkRequest');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.errorType).toBe(ApiErrorType.RATE_LIMIT);
        expect(apiError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should categorize 400-499 as BAD_REQUEST', () => {
      const error = {
        response: {
          status: 422,
          data: { message: 'Invalid input' },
        },
      };

      expect(handler.isRetryable(error)).toBe(false);

      try {
        handler.handle(error, 'createResource');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.errorType).toBe(ApiErrorType.BAD_REQUEST);
      }
    });

    it('should categorize 500 as SERVER_ERROR', () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      };

      expect(handler.isRetryable(error)).toBe(true);

      try {
        handler.handle(error, 'getData');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.errorType).toBe(ApiErrorType.SERVER_ERROR);
        expect(apiError.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      }
    });

    it('should categorize 502, 503, 504 as SERVER_ERROR', () => {
      [502, 503, 504].forEach((status) => {
        const error = { response: { status } };
        expect(handler.isRetryable(error)).toBe(true);
      });
    });

    it('should categorize unknown errors as UNKNOWN', () => {
      const error = new Error('Something unexpected');

      expect(handler.isRetryable(error)).toBe(false);

      try {
        handler.handle(error, 'operation');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.errorType).toBe(ApiErrorType.UNKNOWN);
      }
    });
  });

  describe('isRetryable', () => {
    it('should return true for network errors', () => {
      expect(handler.isRetryable({ code: 'ECONNREFUSED' })).toBe(true);
      expect(handler.isRetryable({ code: 'ENOTFOUND' })).toBe(true);
      expect(handler.isRetryable({ code: 'ENETUNREACH' })).toBe(true);
    });

    it('should return true for timeout errors', () => {
      expect(handler.isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
      expect(handler.isRetryable({ code: 'ECONNABORTED' })).toBe(true);
    });

    it('should return true for 5xx server errors', () => {
      expect(handler.isRetryable({ response: { status: 500 } })).toBe(true);
      expect(handler.isRetryable({ response: { status: 502 } })).toBe(true);
      expect(handler.isRetryable({ response: { status: 503 } })).toBe(true);
      expect(handler.isRetryable({ response: { status: 504 } })).toBe(true);
    });

    it('should return false for authentication errors', () => {
      expect(handler.isRetryable({ response: { status: 401 } })).toBe(false);
      expect(handler.isRetryable({ response: { status: 403 } })).toBe(false);
    });

    it('should return false for client errors', () => {
      expect(handler.isRetryable({ response: { status: 400 } })).toBe(false);
      expect(handler.isRetryable({ response: { status: 404 } })).toBe(false);
      expect(handler.isRetryable({ response: { status: 422 } })).toBe(false);
      expect(handler.isRetryable({ response: { status: 429 } })).toBe(false);
    });

    it('should return false for unknown errors', () => {
      expect(handler.isRetryable(new Error('unknown'))).toBe(false);
      expect(handler.isRetryable({ weird: 'error' })).toBe(false);
    });
  });

  describe('exception creation', () => {
    it('should create ApiException with correct properties', () => {
      const error = {
        response: {
          status: 401,
          data: { error_code: 'INVALID_TOKEN', details: 'Token expired' },
        },
      };

      try {
        handler.handle(error, 'authenticate');
      } catch (e) {
        const apiError = e as ApiException;

        expect(apiError).toBeInstanceOf(ApiException);
        expect(apiError.apiName).toBe('Plaid');
        expect(apiError.errorType).toBe(ApiErrorType.AUTHENTICATION);
        expect(apiError.message).toContain('Plaid API authentication failed');

        const response: any = apiError.getResponse();
        expect(response.details).toEqual({
          error_code: 'INVALID_TOKEN',
          details: 'Token expired',
        });
      }
    });

    it('should include response data in exception details', () => {
      const error = {
        response: {
          status: 400,
          data: {
            message: 'Invalid account ID',
            error_code: 'INVALID_INPUT',
          },
        },
      };

      try {
        handler.handle(error, 'getAccount');
      } catch (e) {
        const apiError = e as ApiException;
        const response: any = apiError.getResponse();

        expect(response.details).toEqual({
          message: 'Invalid account ID',
          error_code: 'INVALID_INPUT',
        });
      }
    });

    it('should use custom message from API response if available', () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Account not found in institution' },
        },
      };

      try {
        handler.handle(error, 'getAccount');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.message).toBe('Account not found in institution');
      }
    });

    it('should use generic message if no response data', () => {
      const error = {
        response: {
          status: 500,
        },
      };

      try {
        handler.handle(error, 'getData');
      } catch (e) {
        const apiError = e as ApiException;
        expect(apiError.message).toBe('Plaid API server error');
      }
    });
  });

  describe('logging', () => {
    it('should log errors with operation context', () => {
      const error = {
        response: {
          status: 429,
          data: { message: 'Rate limited' },
        },
      };

      try {
        handler.handle(error, 'bulkSync', { userId: '123' });
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Plaid API error',
        expect.objectContaining({
          operation: 'bulkSync',
          errorType: ApiErrorType.RATE_LIMIT,
          statusCode: 429,
          userId: '123',
        }),
      );
    });

    it('should log error message from Error objects', () => {
      const error = new Error('Network failure');

      try {
        handler.handle(error, 'connect');
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Plaid API error',
        expect.objectContaining({
          message: 'Network failure',
        }),
      );
    });

    it('should handle non-Error objects gracefully', () => {
      const error = 'string error';

      try {
        handler.handle(error, 'operation');
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Plaid API error',
        expect.objectContaining({
          message: 'Unknown error',
        }),
      );
    });
  });

  describe('HTTP status code mapping', () => {
    it('should return 503 for network errors', () => {
      const error = { code: 'ECONNREFUSED' };

      try {
        handler.handle(error, 'op');
      } catch (e) {
        expect((e as ApiException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    });

    it('should return 504 for timeout errors', () => {
      const error = { code: 'ETIMEDOUT' };

      try {
        handler.handle(error, 'op');
      } catch (e) {
        expect((e as ApiException).getStatus()).toBe(
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
    });

    it('should return 502 for server errors', () => {
      const error = { response: { status: 500 } };

      try {
        handler.handle(error, 'op');
      } catch (e) {
        expect((e as ApiException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      }
    });
  });
});
