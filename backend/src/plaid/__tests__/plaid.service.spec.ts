import { ConfigService } from '@nestjs/config';
import { PlaidService } from '../plaid.service';
import { LoggerService } from '../../common/logging/logger.service';
import { PlaidIntegrationException } from '../exceptions/plaid-integration.exception';
import {
  PlaidApi,
  Products,
  CountryCode,
  PlaidEnvironments,
} from 'plaid';

jest.mock('plaid');

describe('PlaidService', () => {
  let service: PlaidService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockPlaidClient: jest.Mocked<PlaidApi>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        const config = {
          PLAID_ENV: 'sandbox',
          PLAID_CLIENT_ID: 'test-client-id',
          PLAID_SECRET: 'test-secret',
        };
        return config[key];
      }),
    } as any;

    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    mockPlaidClient = {
      linkTokenCreate: jest.fn(),
      itemPublicTokenExchange: jest.fn(),
      accountsGet: jest.fn(),
    } as any;

    // Mock PlaidApi constructor
    (PlaidApi as jest.MockedClass<typeof PlaidApi>).mockImplementation(
      () => mockPlaidClient,
    );

    service = new PlaidService(mockConfigService, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with sandbox environment', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('PLAID_ENV');
      expect(mockConfigService.get).toHaveBeenCalledWith('PLAID_CLIENT_ID');
      expect(mockConfigService.get).toHaveBeenCalledWith('PLAID_SECRET');
      expect(mockLogger.setContext).toHaveBeenCalledWith('PlaidService');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plaid client initialized',
        expect.objectContaining({
          environment: 'sandbox',
          basePath: PlaidEnvironments.sandbox,
        }),
      );
    });

    it('should initialize with production environment', () => {
      mockConfigService.get = jest.fn((key: string) => {
        if (key === 'PLAID_ENV') return 'production';
        if (key === 'PLAID_CLIENT_ID') return 'prod-client-id';
        if (key === 'PLAID_SECRET') return 'prod-secret';
      }) as any;

      service = new PlaidService(mockConfigService, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plaid client initialized',
        expect.objectContaining({
          environment: 'production',
          basePath: PlaidEnvironments.production,
        }),
      );
    });

    it('should initialize with development environment', () => {
      mockConfigService.get = jest.fn((key: string) => {
        if (key === 'PLAID_ENV') return 'development';
        if (key === 'PLAID_CLIENT_ID') return 'dev-client-id';
        if (key === 'PLAID_SECRET') return 'dev-secret';
      }) as any;

      service = new PlaidService(mockConfigService, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plaid client initialized',
        expect.objectContaining({
          environment: 'development',
          basePath: PlaidEnvironments.development,
        }),
      );
    });
  });

  describe('createLinkToken', () => {
    it('should create link token successfully', async () => {
      const mockResponse = {
        data: {
          link_token: 'link-sandbox-test-token',
          expiration: '2025-01-20T12:00:00Z',
          request_id: 'req-123',
        },
      };

      mockPlaidClient.linkTokenCreate.mockResolvedValue(mockResponse as any);

      const result = await service.createLinkToken('user-123');

      expect(result).toEqual(mockResponse.data);
      expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledWith({
        user: {
          client_user_id: 'user-123',
        },
        client_name: 'Rest Treasury',
        products: [Products.Auth, Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plaid link token created successfully',
        expect.objectContaining({
          userId: 'user-123',
          requestId: 'req-123',
        }),
      );
    });

    it('should throw PlaidIntegrationException on failure', async () => {
      const plaidError = {
        message: 'Invalid client credentials',
        response: {
          status: 401,
          data: {
            error_code: 'INVALID_CREDENTIALS',
            error_type: 'INVALID_REQUEST',
            display_message: 'Invalid API keys',
          },
        },
      };

      mockPlaidClient.linkTokenCreate.mockRejectedValue(plaidError);

      await expect(service.createLinkToken('user-123')).rejects.toThrow(
        PlaidIntegrationException,
      );
      await expect(service.createLinkToken('user-123')).rejects.toThrow(
        'Failed to create link token',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create Plaid link token',
        expect.objectContaining({
          userId: 'user-123',
          errorCode: 'INVALID_CREDENTIALS',
          errorType: 'INVALID_REQUEST',
        }),
      );
    });

    it('should handle missing userId (empty string)', async () => {
      const mockResponse = {
        data: {
          link_token: 'link-test',
          expiration: '2025-01-20T12:00:00Z',
          request_id: 'req-456',
        },
      };

      mockPlaidClient.linkTokenCreate.mockResolvedValue(mockResponse as any);

      // Service doesn't validate - Plaid API will
      await service.createLinkToken('');

      expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { client_user_id: '' },
        }),
      );
    });

    it(
      'should retry on 5xx server errors',
      async () => {
        const serverError = {
          message: 'Internal server error',
          response: {
            status: 500,
            data: {
              error_code: 'INTERNAL_SERVER_ERROR',
              error_type: 'API_ERROR',
            },
          },
        };

        const successResponse = {
          data: {
            link_token: 'link-sandbox-retry-success',
            expiration: '2025-01-20T12:00:00Z',
            request_id: 'req-retry',
          },
        };

        // Fail twice, succeed on third attempt
        mockPlaidClient.linkTokenCreate
          .mockRejectedValueOnce(serverError)
          .mockRejectedValueOnce(serverError)
          .mockResolvedValueOnce(successResponse as any);

        const result = await service.createLinkToken('user-retry');

        expect(result).toEqual(successResponse.data);
        expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledTimes(3);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Retrying Plaid request',
          expect.objectContaining({
            attempt: expect.any(Number),
            maxRetries: 3,
          }),
        );
      },
      20000,
    );

    it('should NOT retry on 4xx client errors', async () => {
      const clientError = {
        message: 'Invalid request',
        response: {
          status: 400,
          data: {
            error_code: 'INVALID_FIELD',
            error_type: 'INVALID_REQUEST',
          },
        },
      };

      mockPlaidClient.linkTokenCreate.mockRejectedValue(clientError);

      await expect(service.createLinkToken('user-123')).rejects.toThrow(
        PlaidIntegrationException,
      );

      // Should only be called once (no retries for client errors)
      expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledTimes(1);
    });

    it(
      'should fail after max retries',
      async () => {
        const serverError = {
          message: 'Service unavailable',
          response: {
            status: 503,
            data: {
              error_code: 'SERVICE_UNAVAILABLE',
              error_type: 'API_ERROR',
            },
          },
        };

        mockPlaidClient.linkTokenCreate.mockRejectedValue(serverError);

        await expect(
          service.createLinkToken('user-retry-fail'),
        ).rejects.toThrow(PlaidIntegrationException);

        // Should be called 4 times (1 initial + 3 retries)
        expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledTimes(4);
      },
      20000,
    ); // 20 second timeout for retry test
  });

  describe('exchangePublicToken', () => {
    it('should exchange public token successfully', async () => {
      const mockResponse = {
        data: {
          access_token: 'access-sandbox-test-token',
          item_id: 'item-sandbox-123',
          request_id: 'req-exchange',
        },
      };

      mockPlaidClient.itemPublicTokenExchange.mockResolvedValue(
        mockResponse as any,
      );

      const result = await service.exchangePublicToken(
        'public-sandbox-test-token',
      );

      expect(result).toEqual(mockResponse.data);
      expect(mockPlaidClient.itemPublicTokenExchange).toHaveBeenCalledWith({
        public_token: 'public-sandbox-test-token',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Public token exchanged successfully',
        expect.objectContaining({
          itemId: 'item-sandbox-123',
          requestId: 'req-exchange',
        }),
      );
    });

    it('should throw PlaidIntegrationException on invalid token', async () => {
      const invalidTokenError = {
        message: 'Invalid public token',
        response: {
          status: 400,
          data: {
            error_code: 'INVALID_PUBLIC_TOKEN',
            error_type: 'INVALID_REQUEST',
            display_message: 'The provided public token is invalid',
          },
        },
      };

      mockPlaidClient.itemPublicTokenExchange.mockRejectedValue(
        invalidTokenError,
      );

      await expect(
        service.exchangePublicToken('invalid-token'),
      ).rejects.toThrow(PlaidIntegrationException);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to exchange public token',
        expect.objectContaining({
          errorCode: 'INVALID_PUBLIC_TOKEN',
          errorType: 'INVALID_REQUEST',
        }),
      );
    });

    it('should handle expired public token', async () => {
      const expiredTokenError = {
        message: 'Public token expired',
        response: {
          status: 400,
          data: {
            error_code: 'EXPIRED_PUBLIC_TOKEN',
            error_type: 'INVALID_REQUEST',
          },
        },
      };

      mockPlaidClient.itemPublicTokenExchange.mockRejectedValue(
        expiredTokenError,
      );

      await expect(
        service.exchangePublicToken('expired-token'),
      ).rejects.toThrow(PlaidIntegrationException);

      // Should not retry on client error
      expect(mockPlaidClient.itemPublicTokenExchange).toHaveBeenCalledTimes(1);
    });

    it('should sanitize public token in logs (security)', async () => {
      const longPublicToken =
        'public-sandbox-very-long-token-with-sensitive-data-1234567890';

      const mockResponse = {
        data: {
          access_token: 'access-token',
          item_id: 'item-123',
          request_id: 'req-sanitize',
        },
      };

      mockPlaidClient.itemPublicTokenExchange.mockResolvedValue(
        mockResponse as any,
      );

      await service.exchangePublicToken(longPublicToken);

      // Verify only first 20 chars are logged
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Exchanging Plaid public token',
        expect.objectContaining({
          publicTokenPrefix: longPublicToken.substring(0, 20),
        }),
      );

      // Ensure full token is NOT in logs
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          publicToken: longPublicToken,
        }),
      );
    });

    it('should retry on network errors', async () => {
      const networkError = new Error('Network timeout');

      const successResponse = {
        data: {
          access_token: 'access-retry-success',
          item_id: 'item-retry',
          request_id: 'req-retry-network',
        },
      };

      // Fail twice, succeed on third
      mockPlaidClient.itemPublicTokenExchange
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse as any);

      const result = await service.exchangePublicToken('public-retry-token');

      expect(result).toEqual(successResponse.data);
      expect(mockPlaidClient.itemPublicTokenExchange).toHaveBeenCalledTimes(3);
    }, 20000);
  });

  describe('getAccounts', () => {
    it('should fetch accounts successfully', async () => {
      const mockResponse = {
        data: {
          accounts: [
            {
              account_id: 'acc-123',
              name: 'Checking Account',
              type: 'depository',
              subtype: 'checking',
              balances: {
                available: 1000,
                current: 1200,
                iso_currency_code: 'USD',
              },
            },
            {
              account_id: 'acc-456',
              name: 'Savings Account',
              type: 'depository',
              subtype: 'savings',
              balances: {
                available: 5000,
                current: 5000,
                iso_currency_code: 'USD',
              },
            },
          ],
          item: {
            item_id: 'item-123',
            institution_id: 'ins_109508',
          },
          request_id: 'req-accounts',
        },
      };

      mockPlaidClient.accountsGet.mockResolvedValue(mockResponse as any);

      const result = await service.getAccounts('access-sandbox-token');

      expect(result).toEqual(mockResponse.data);
      expect(mockPlaidClient.accountsGet).toHaveBeenCalledWith({
        access_token: 'access-sandbox-token',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Accounts fetched successfully',
        expect.objectContaining({
          accountCount: 2,
          requestId: 'req-accounts',
        }),
      );
    });

    it('should throw PlaidIntegrationException on invalid access token', async () => {
      const invalidTokenError = {
        message: 'Invalid access token',
        response: {
          status: 400,
          data: {
            error_code: 'INVALID_ACCESS_TOKEN',
            error_type: 'INVALID_INPUT',
          },
        },
      };

      mockPlaidClient.accountsGet.mockRejectedValue(invalidTokenError);

      await expect(service.getAccounts('invalid-access-token')).rejects.toThrow(
        PlaidIntegrationException,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch accounts',
        expect.objectContaining({
          errorCode: 'INVALID_ACCESS_TOKEN',
        }),
      );
    });

    it('should handle item login required error', async () => {
      const loginRequiredError = {
        message: 'Item login required',
        response: {
          status: 400,
          data: {
            error_code: 'ITEM_LOGIN_REQUIRED',
            error_type: 'ITEM_ERROR',
            display_message: 'User needs to re-authenticate',
          },
        },
      };

      mockPlaidClient.accountsGet.mockRejectedValue(loginRequiredError);

      await expect(
        service.getAccounts('access-token-login-required'),
      ).rejects.toThrow(PlaidIntegrationException);

      // Verify error details are preserved
      try {
        await service.getAccounts('access-token-login-required');
      } catch (error) {
        expect(error.getResponse()).toMatchObject({
          errorCode: 'ITEM_LOGIN_REQUIRED',
          errorType: 'ITEM_ERROR',
          displayMessage: 'User needs to re-authenticate',
        });
      }
    });

    it('should handle empty accounts list', async () => {
      const mockResponse = {
        data: {
          accounts: [],
          item: {
            item_id: 'item-empty',
            institution_id: 'ins_test',
          },
          request_id: 'req-empty',
        },
      };

      mockPlaidClient.accountsGet.mockResolvedValue(mockResponse as any);

      const result = await service.getAccounts('access-no-accounts');

      expect(result.accounts).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Accounts fetched successfully',
        expect.objectContaining({
          accountCount: 0,
        }),
      );
    });

    it('should retry on rate limit errors (429)', async () => {
      const rateLimitError = {
        message: 'Rate limit exceeded',
        response: {
          status: 429,
          data: {
            error_code: 'RATE_LIMIT_EXCEEDED',
            error_type: 'RATE_LIMIT_ERROR',
          },
        },
      };

      const successResponse = {
        data: {
          accounts: [
            {
              account_id: 'acc-rate-limit',
              name: 'Test Account',
              type: 'depository',
              subtype: 'checking',
              balances: {
                available: 100,
                current: 100,
                iso_currency_code: 'USD',
              },
            },
          ],
          item: {
            item_id: 'item-rate',
            institution_id: 'ins_test',
          },
          request_id: 'req-rate-limit',
        },
      };

      // Fail once with rate limit, then succeed
      mockPlaidClient.accountsGet
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse as any);

      const result = await service.getAccounts('access-rate-limit');

      expect(result).toEqual(successResponse.data);
      expect(mockPlaidClient.accountsGet).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry logic edge cases', () => {
    it('should handle concurrent requests without interference', async () => {
      const mockResponse1 = {
        data: {
          link_token: 'link-1',
          expiration: '2025-01-20T12:00:00Z',
          request_id: 'req-1',
        },
      };

      const mockResponse2 = {
        data: {
          link_token: 'link-2',
          expiration: '2025-01-20T12:00:00Z',
          request_id: 'req-2',
        },
      };

      mockPlaidClient.linkTokenCreate
        .mockResolvedValueOnce(mockResponse1 as any)
        .mockResolvedValueOnce(mockResponse2 as any);

      // Fire concurrent requests
      const [result1, result2] = await Promise.all([
        service.createLinkToken('user-1'),
        service.createLinkToken('user-2'),
      ]);

      expect(result1.link_token).toBe('link-1');
      expect(result2.link_token).toBe('link-2');
      expect(mockPlaidClient.linkTokenCreate).toHaveBeenCalledTimes(2);
    });

    it(
      'should handle undefined error response gracefully',
      async () => {
        const unknownError = new Error('Unknown error');
        // No response object

        mockPlaidClient.linkTokenCreate.mockRejectedValue(unknownError);

        await expect(service.createLinkToken('user-unknown')).rejects.toThrow(
          PlaidIntegrationException,
        );

        // Should still log error even without response details
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to create Plaid link token',
          expect.objectContaining({
            userId: 'user-unknown',
            error: 'Unknown error',
          }),
        );
      },
      20000,
    ); // 20 second timeout for retry test
  });
});
