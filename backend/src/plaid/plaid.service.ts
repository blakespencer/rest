import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  LinkTokenCreateResponse,
  ItemPublicTokenExchangeResponse,
  AccountsGetResponse,
} from 'plaid';
import retry from 'async-retry';
import { LoggerService } from '../common/logging/logger.service';
import { PlaidIntegrationException } from './exceptions/plaid-integration.exception';

@Injectable()
export class PlaidService {
  private readonly client: PlaidApi;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second base delay

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('PlaidService');

    const plaidEnv = this.configService.get<string>('PLAID_ENV');
    const basePath =
      plaidEnv === 'production'
        ? PlaidEnvironments.production
        : plaidEnv === 'development'
          ? PlaidEnvironments.development
          : PlaidEnvironments.sandbox;

    const configuration = new Configuration({
      basePath,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.configService.get<string>('PLAID_CLIENT_ID'),
          'PLAID-SECRET': this.configService.get<string>('PLAID_SECRET'),
        },
      },
    });

    this.client = new PlaidApi(configuration);

    this.logger.info('Plaid client initialized', {
      environment: plaidEnv,
      basePath,
    });
  }

  /**
   * Create a Link token for initializing Plaid Link
   * @param userId - The user's unique identifier
   * @returns LinkTokenCreateResponse containing the link token
   */
  async createLinkToken(userId: string): Promise<LinkTokenCreateResponse> {
    this.logger.debug('Creating Plaid link token', { userId });

    try {
      const response = await this.executeWithRetry(async () => {
        return this.client.linkTokenCreate({
          user: {
            client_user_id: userId,
          },
          client_name: 'Rest Treasury',
          products: [Products.Auth, Products.Transactions],
          country_codes: [CountryCode.Us],
          language: 'en',
        });
      });

      this.logger.info('Plaid link token created successfully', {
        userId,
        requestId: response.data.request_id,
        expiration: response.data.expiration,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create Plaid link token', {
        userId,
        error: error.message,
        errorCode: error.response?.data?.error_code,
        errorType: error.response?.data?.error_type,
      });

      throw new PlaidIntegrationException(
        'Failed to create link token',
        error,
      );
    }
  }

  /**
   * Exchange a public token for a permanent access token
   * @param publicToken - The public token from Plaid Link
   * @returns ItemPublicTokenExchangeResponse containing access_token and item_id
   */
  async exchangePublicToken(
    publicToken: string,
  ): Promise<ItemPublicTokenExchangeResponse> {
    this.logger.debug('Exchanging Plaid public token', {
      publicTokenPrefix: publicToken.substring(0, 20),
    });

    try {
      const response = await this.executeWithRetry(async () => {
        return this.client.itemPublicTokenExchange({
          public_token: publicToken,
        });
      });

      this.logger.info('Public token exchanged successfully', {
        itemId: response.data.item_id,
        requestId: response.data.request_id,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to exchange public token', {
        publicTokenPrefix: publicToken.substring(0, 20),
        error: error.message,
        errorCode: error.response?.data?.error_code,
        errorType: error.response?.data?.error_type,
      });

      throw new PlaidIntegrationException(
        'Failed to exchange public token',
        error,
      );
    }
  }

  /**
   * Get account balances and metadata
   * @param accessToken - The access token for the Item
   * @returns AccountsGetResponse containing account details
   */
  async getAccounts(accessToken: string): Promise<AccountsGetResponse> {
    this.logger.debug('Fetching Plaid accounts');

    try {
      const response = await this.executeWithRetry(async () => {
        return this.client.accountsGet({
          access_token: accessToken,
        });
      });

      this.logger.info('Accounts fetched successfully', {
        accountCount: response.data.accounts.length,
        requestId: response.data.request_id,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch accounts', {
        error: error.message,
        errorCode: error.response?.data?.error_code,
        errorType: error.response?.data?.error_type,
      });

      throw new PlaidIntegrationException('Failed to fetch accounts', error);
    }
  }

  /**
   * Execute an operation with exponential backoff retry logic
   * @param operation - The async operation to execute
   * @returns The result of the operation
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    return retry(
      async (bail, attempt) => {
        try {
          return await operation();
        } catch (error) {
          const status = error.response?.status;

          // Don't retry on client errors (4xx) EXCEPT for rate limits (429)
          if (status >= 400 && status < 500 && status !== 429) {
            this.logger.warn('Client error, not retrying', {
              status,
              errorCode: error.response?.data?.error_code,
            });
            bail(error);
            throw error; // Must throw after bail to stop retry
          }

          // Retry on server errors (5xx), rate limits (429), or network errors
          this.logger.warn('Retrying Plaid operation', {
            attempt,
            error: error.message,
            status: status || 'network error',
          });

          throw error;
        }
      },
      {
        retries: this.maxRetries,
        factor: 2, // Exponential backoff factor
        minTimeout: this.retryDelay,
        maxTimeout: 10000, // Max 10 seconds
        randomize: true, // Add jitter to prevent thundering herd
        onRetry: (error, attempt) => {
          this.logger.warn('Retrying Plaid request', {
            attempt,
            maxRetries: this.maxRetries,
            error: error.message,
          });
        },
      },
    );
  }
}
