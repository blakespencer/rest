import { Prisma, PrismaClient } from '@prisma/client';
import { BaseService } from '../base.service';
import { LoggerService } from '../../logging/logger.service';
import { ApiErrorType, ApiException } from '../../exceptions/api-error.handler';

// Concrete implementation for testing
class TestService extends BaseService {
  protected readonly logger: LoggerService;
  protected readonly prisma: PrismaClient;

  constructor(logger: LoggerService, prisma: PrismaClient) {
    super();
    this.logger = logger;
    this.prisma = prisma;
  }
}

describe('BaseService', () => {
  let service: TestService;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    mockPrisma = {
      $transaction: jest.fn(),
    } as any;

    service = new TestService(mockLogger, mockPrisma);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('executeInTransaction', () => {
    it('should execute operation within transaction', async () => {
      const mockTx = {} as Prisma.TransactionClient;
      const operationFn = jest.fn().mockResolvedValue({ id: '1' });

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        return fn(mockTx);
      });

      const result = await service['executeInTransaction'](operationFn);

      expect(result).toEqual({ id: '1' });
      expect(operationFn).toHaveBeenCalledWith(mockTx);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should rollback on error and log', async () => {
      const error = new Error('Transaction failed');
      const operationFn = jest.fn().mockRejectedValue(error);

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        return fn({});
      });

      await expect(service['executeInTransaction'](operationFn)).rejects.toThrow(
        'Transaction failed',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Transaction failed',
        expect.objectContaining({
          service: 'TestService',
          error: 'Transaction failed',
        }),
      );
    });
  });

  describe('executeApiCall', () => {
    it('should execute successful API call and log', async () => {
      const apiCallFn = jest.fn().mockResolvedValue({ data: 'success' });

      const result = await service['executeApiCall'](
        'Plaid',
        'getAccounts',
        apiCallFn,
        { userId: '123' },
      );

      expect(result).toEqual({ data: 'success' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing Plaid API call',
        expect.objectContaining({
          operation: 'getAccounts',
          userId: '123',
        }),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plaid API call successful',
        expect.objectContaining({
          operation: 'getAccounts',
        }),
      );
    });

    it('should handle API errors and throw ApiException', async () => {
      const apiError = {
        response: { status: 401 },
      };
      const apiCallFn = jest.fn().mockRejectedValue(apiError);

      await expect(
        service['executeApiCall']('Plaid', 'authenticate', apiCallFn),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('executeApiCallWithRetry', () => {
    it('should succeed on first try without retrying', async () => {
      const apiCallFn = jest.fn().mockResolvedValue({ data: 'success' });

      const result = await service['executeApiCallWithRetry'](
        'Plaid',
        'getAccounts',
        apiCallFn,
      );

      expect(result).toEqual({ data: 'success' });
      expect(apiCallFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should retry on retryable errors (network)', async () => {
      const networkError = { code: 'ECONNREFUSED' };
      const apiCallFn = jest
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: 'success' });

      const promise = service['executeApiCallWithRetry'](
        'Plaid',
        'getAccounts',
        apiCallFn,
        { retries: 3, minTimeout: 1000 },
      );

      // First retry: 1000ms
      await jest.advanceTimersByTimeAsync(1000);

      // Second retry: 2000ms (exponential backoff: 1000 * 2^1)
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(apiCallFn).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plaid API call succeeded after retry',
        expect.objectContaining({
          attempt: 2,
        }),
      );
    });

    it('should retry on 5xx server errors', async () => {
      const serverError = { response: { status: 503 } };
      const apiCallFn = jest
        .fn()
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: 'success' });

      const promise = service['executeApiCallWithRetry'](
        'Plaid',
        'getData',
        apiCallFn,
        { retries: 2, minTimeout: 500 },
      );

      await jest.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(apiCallFn).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on non-retryable errors (401, 404)', async () => {
      const authError = { response: { status: 401 } };
      const apiCallFn = jest.fn().mockRejectedValue(authError);

      await expect(
        service['executeApiCallWithRetry']('Plaid', 'auth', apiCallFn),
      ).rejects.toThrow();

      expect(apiCallFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should NOT retry on rate limit errors (429)', async () => {
      const rateLimitError = { response: { status: 429 } };
      const apiCallFn = jest.fn().mockRejectedValue(rateLimitError);

      await expect(
        service['executeApiCallWithRetry']('Plaid', 'bulkRequest', apiCallFn),
      ).rejects.toThrow();

      expect(apiCallFn).toHaveBeenCalledTimes(1);
    });

    it('should throw ApiException after max retries exhausted', async () => {
      // Use real timers for this test to avoid fake timer + promise rejection coordination issues
      jest.useRealTimers();

      const networkError = { code: 'ETIMEDOUT' };
      const apiCallFn = jest.fn().mockRejectedValue(networkError);

      // Use very short timeout (10ms) so test runs quickly
      await expect(
        service['executeApiCallWithRetry']('Plaid', 'getData', apiCallFn, {
          retries: 2,
          minTimeout: 10, // 10ms delay between retries
        }),
      ).rejects.toThrow(ApiException);

      expect(apiCallFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Plaid API call failed',
        expect.objectContaining({
          attempts: 3,
        }),
      );

      // Restore fake timers for other tests
      jest.useFakeTimers();
    });

    it('should use exponential backoff correctly', async () => {
      const error = { code: 'ETIMEDOUT' };
      const apiCallFn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      const promise = service['executeApiCallWithRetry'](
        'Plaid',
        'getData',
        apiCallFn,
        {
          retries: 3,
          minTimeout: 1000,
          factor: 2,
          maxTimeout: 10000,
        },
      );

      // First retry: 1000ms (1000 * 2^0)
      await jest.advanceTimersByTimeAsync(1000);

      // Second retry: 2000ms (1000 * 2^1)
      await jest.advanceTimersByTimeAsync(2000);

      // Third retry: 4000ms (1000 * 2^2)
      await jest.advanceTimersByTimeAsync(4000);

      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(apiCallFn).toHaveBeenCalledTimes(4);
    });

    it('should respect maxTimeout in exponential backoff', async () => {
      const error = { code: 'ETIMEDOUT' };
      const apiCallFn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      const promise = service['executeApiCallWithRetry'](
        'Plaid',
        'getData',
        apiCallFn,
        {
          retries: 3,
          minTimeout: 1000,
          factor: 100, // Would normally be huge
          maxTimeout: 2000, // But capped at 2000
        },
      );

      // Should wait maxTimeout (2000ms), not 100000ms
      await jest.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result).toEqual({ data: 'success' });
    });

    it('should use custom onlyRetryIf predicate if provided', async () => {
      const error = { code: 'CUSTOM_ERROR' };
      const apiCallFn = jest.fn().mockRejectedValue(error);

      const onlyRetryIf = jest.fn().mockReturnValue(false);

      await expect(
        service['executeApiCallWithRetry']('Plaid', 'getData', apiCallFn, {
          retries: 3,
          onlyRetryIf,
        }),
      ).rejects.toThrow();

      expect(onlyRetryIf).toHaveBeenCalledWith(error);
      expect(apiCallFn).toHaveBeenCalledTimes(1); // No retries
    });

    it('should retry if custom onlyRetryIf returns true', async () => {
      const error = { custom: 'error' };
      const apiCallFn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      const onlyRetryIf = jest.fn().mockReturnValue(true);

      const promise = service['executeApiCallWithRetry'](
        'Plaid',
        'getData',
        apiCallFn,
        {
          retries: 3,
          minTimeout: 100,
          onlyRetryIf,
        },
      );

      await jest.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(onlyRetryIf).toHaveBeenCalledWith(error);
      expect(apiCallFn).toHaveBeenCalledTimes(2);
    });

    it('should log each retry attempt with context', async () => {
      const error = { code: 'ECONNREFUSED' };
      const apiCallFn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      const promise = service['executeApiCallWithRetry'](
        'Plaid',
        'getAccounts',
        apiCallFn,
        { retries: 2, minTimeout: 500 },
        { userId: '123' },
      );

      await jest.advanceTimersByTimeAsync(500);
      await promise;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Retrying Plaid API call',
        expect.objectContaining({
          operation: 'getAccounts',
          attempt: 1,
          nextRetryIn: 500,
          userId: '123',
        }),
      );
    });
  });
});
