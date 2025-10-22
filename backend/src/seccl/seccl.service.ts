import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import retry from 'async-retry';
import { LoggerService } from '../common/logging/logger.service';
import { SecclIntegrationException } from './exceptions/seccl-integration.exception';
import {
  CreateSecclAccountDto,
  CreateSecclAccountResponseDto,
} from './dto/create-account.dto';
import {
  CreateTransactionGroupDto,
  CreateTransactionGroupResponseDto,
  TransactionType,
} from './dto/transaction-group.dto';
import {
  CompleteTransactionDto,
  CompleteTransactionResponseDto,
} from './dto/transaction-action.dto';
import { AccountSummaryDto } from './dto/account-summary.dto';
import { PositionDetailDto } from './dto/position.dto';

/**
 * Mock Seccl Service - Simulates Seccl API for sandbox/testing
 *
 * In production, this would make actual HTTP requests to Seccl API.
 * For MVP, we're using in-memory storage to simulate the API.
 */
@Injectable()
export class SecclService {
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;
  private readonly isMockMode: boolean;

  // In-memory storage for mock mode
  private mockAccounts: Map<
    string,
    CreateSecclAccountDto & { id: string }
  > = new Map();
  private mockTransactionGroups: Map<
    string,
    CreateTransactionGroupResponseDto
  > = new Map();
  private mockTransactions: Map<
    string,
    {
      id: string;
      type: TransactionType;
      status: string;
      linkId: string;
      details: any;
    }
  > = new Map();
  private mockPositions: Map<string, PositionDetailDto> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('SecclService');

    // Use mock mode if SECCL_API_KEY is not provided
    this.isMockMode = !this.configService.get<string>('SECCL_API_KEY');

    if (this.isMockMode) {
      this.logger.info('Seccl service initialized in MOCK mode');
    } else {
      this.logger.info('Seccl service initialized', {
        baseUrl: this.configService.get<string>('SECCL_BASE_URL'),
      });
    }
  }

  /**
   * 1. Create Investment Account
   * POST /account
   */
  async createAccount(
    dto: CreateSecclAccountDto,
  ): Promise<CreateSecclAccountResponseDto> {
    this.logger.info('Creating Seccl account', {
      clientId: dto.clientId,
      wrapperType: dto.wrapperDetail.wrapperType,
    });

    try {
      if (this.isMockMode) {
        return this.mockCreateAccount(dto);
      }

      // Real API call would go here
      throw new Error('Real Seccl API not implemented yet');
    } catch (error) {
      this.logger.error('Failed to create Seccl account', {
        error: error.message,
        clientId: dto.clientId,
      });
      throw new SecclIntegrationException('Account creation failed', error);
    }
  }

  /**
   * 2. Create Payment In and Order Expectation
   * POST /portfoliotransactiongroup
   */
  async createTransactionGroup(
    dto: CreateTransactionGroupDto,
  ): Promise<CreateTransactionGroupResponseDto> {
    this.logger.info('Creating Seccl transaction group', {
      accountId: dto.accountId,
      transactionCount: dto.transactions.length,
    });

    try {
      if (this.isMockMode) {
        return this.mockCreateTransactionGroup(dto);
      }

      // Real API call would go here
      throw new Error('Real Seccl API not implemented yet');
    } catch (error) {
      this.logger.error('Failed to create transaction group', {
        error: error.message,
        accountId: dto.accountId,
      });
      throw new SecclIntegrationException(
        'Transaction group creation failed',
        error,
      );
    }
  }

  /**
   * 3. Complete Payment or Order
   * PUT /portfoliotransactionaction/{firmId}/{transactionId}
   */
  async completeTransaction(
    firmId: string,
    transactionId: string,
    dto: CompleteTransactionDto,
  ): Promise<CompleteTransactionResponseDto> {
    this.logger.info('Completing Seccl transaction', {
      firmId,
      transactionId,
      action: dto.transactionAction,
    });

    try {
      if (this.isMockMode) {
        return this.mockCompleteTransaction(firmId, transactionId, dto);
      }

      // Real API call would go here
      throw new Error('Real Seccl API not implemented yet');
    } catch (error) {
      this.logger.error('Failed to complete transaction', {
        error: error.message,
        transactionId,
      });
      throw new SecclIntegrationException('Transaction completion failed', error);
    }
  }

  /**
   * 4. Retrieve Pending Orders
   * GET /portfoliotransaction/{firmId}?linkId={linkId}&transactionType=Order
   */
  async getTransactions(
    firmId: string,
    linkId: string,
    transactionType: TransactionType,
  ): Promise<any[]> {
    this.logger.info('Retrieving Seccl transactions', {
      firmId,
      linkId,
      transactionType,
    });

    try {
      if (this.isMockMode) {
        return this.mockGetTransactions(linkId, transactionType);
      }

      // Real API call would go here
      throw new Error('Real Seccl API not implemented yet');
    } catch (error) {
      this.logger.error('Failed to retrieve transactions', {
        error: error.message,
        linkId,
      });
      throw new SecclIntegrationException('Transaction retrieval failed', error);
    }
  }

  /**
   * 6. Retrieve Account Summary
   * GET /account/summary/{firmId}/{accountId}
   */
  async getAccountSummary(
    firmId: string,
    accountId: string,
  ): Promise<AccountSummaryDto> {
    this.logger.info('Retrieving account summary', { firmId, accountId });

    try {
      if (this.isMockMode) {
        return this.mockGetAccountSummary(firmId, accountId);
      }

      // Real API call would go here
      throw new Error('Real Seccl API not implemented yet');
    } catch (error) {
      this.logger.error('Failed to retrieve account summary', {
        error: error.message,
        accountId,
      });
      throw new SecclIntegrationException(
        'Account summary retrieval failed',
        error,
      );
    }
  }

  /**
   * 7. Retrieve Position Details
   * GET /position/{firmId}/{positionId}
   */
  async getPosition(
    firmId: string,
    positionId: string,
  ): Promise<PositionDetailDto> {
    this.logger.info('Retrieving position details', { firmId, positionId });

    try {
      if (this.isMockMode) {
        return this.mockGetPosition(firmId, positionId);
      }

      // Real API call would go here
      throw new Error('Real Seccl API not implemented yet');
    } catch (error) {
      this.logger.error('Failed to retrieve position', {
        error: error.message,
        positionId,
      });
      throw new SecclIntegrationException('Position retrieval failed', error);
    }
  }

  // ========== MOCK IMPLEMENTATIONS ==========

  private mockCreateAccount(
    dto: CreateSecclAccountDto,
  ): CreateSecclAccountResponseDto {
    const accountId = this.generateMockId('ACC');

    this.mockAccounts.set(accountId, {
      ...dto,
      id: accountId,
    });

    return { id: accountId };
  }

  private mockCreateTransactionGroup(
    dto: CreateTransactionGroupDto,
  ): CreateTransactionGroupResponseDto {
    const linkId = this.generateMockId('TG');
    const transactions = dto.transactions.map((tx, index) => ({
      id: this.generateMockId(
        tx.transactionType === TransactionType.Payment ? 'PAY' : 'ORD',
      ),
      transactionType: tx.transactionType,
      status: 'Pending',
    }));

    const response: CreateTransactionGroupResponseDto = {
      linkId,
      transactions,
    };

    this.mockTransactionGroups.set(linkId, response);

    // Store individual transactions for later retrieval
    transactions.forEach((tx, index) => {
      this.mockTransactions.set(tx.id, {
        id: tx.id,
        type: tx.transactionType as TransactionType,
        status: 'Pending',
        linkId,
        details: dto.transactions[index],
      });
    });

    return response;
  }

  private mockCompleteTransaction(
    firmId: string,
    transactionId: string,
    dto: CompleteTransactionDto,
  ): CompleteTransactionResponseDto {
    const transaction = this.mockTransactions.get(transactionId);

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Update status
    transaction.status = 'Completed';

    // If this is an order with execution details, create position
    if (dto.executionDetails && transaction.type === TransactionType.Order) {
      const positionId = this.generatePositionId(
        transaction.details.accountId,
        transaction.details.assetId,
      );

      this.mockPositions.set(positionId, {
        id: positionId,
        accountId: transaction.details.accountId,
        accountName: 'Mock Investment Account',
        accountType: 'Wrapper',
        assetId: transaction.details.assetId,
        assetName: 'Money Market Fund',
        currency: transaction.details.currency,
        firmId,
        isin: 'GB00MOCK1234',
        nodeId: '0',
        positionType: 'Stock',
        quantity: dto.executionDetails.executedQuantity,
        bookValue: transaction.details.amount,
        currentValue: transaction.details.amount,
        growth: 0,
        growthPercent: 0,
        cgtData: {
          realisedProfitLoss: 0,
          unrealisedProfitLoss: 0,
        },
        instrumentType: 'Fund',
        assetCountryOfIssue: 'GB',
        transactions: [
          {
            transactionId: transaction.id,
            transactionCode: 'BUY',
            narrative: 'Order executed',
            postDate: new Date().toISOString(),
            valueDate: new Date().toISOString(),
            quantity: dto.executionDetails.executedQuantity,
            value: transaction.details.amount,
            bookValue: transaction.details.amount,
            profitLoss: 0,
          },
        ],
      });
    }

    return {
      id: transactionId,
      transactionType: transaction.type,
      status: 'Completed',
      completedDate: dto.completedDate,
      executionDetails: dto.executionDetails,
    };
  }

  private mockGetTransactions(
    linkId: string,
    transactionType: TransactionType,
  ): any[] {
    const transactions: any[] = [];

    this.mockTransactions.forEach((tx) => {
      if (tx.linkId === linkId && tx.type === transactionType) {
        transactions.push({
          id: tx.id,
          firmId: tx.details.firmId,
          accountId: tx.details.accountId,
          transactionType: tx.type,
          transactionSubType: tx.details.transactionSubType,
          movementType: tx.details.movementType,
          currency: tx.details.currency,
          amount: tx.details.amount,
          assetId: tx.details.assetId,
          status: tx.status,
          linkId: tx.linkId,
          createdDate: new Date().toISOString(),
        });
      }
    });

    return transactions;
  }

  private mockGetAccountSummary(
    firmId: string,
    accountId: string,
  ): AccountSummaryDto {
    const account = this.mockAccounts.get(accountId);

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Find all positions for this account
    const positions: any[] = [];
    let totalInvested = 0;

    this.mockPositions.forEach((position) => {
      if (position.accountId === accountId) {
        positions.push({
          assetId: position.assetId,
          assetName: position.assetName,
          quantity: position.quantity,
          bookValue: position.bookValue,
          currentValue: position.currentValue,
          growth: position.growth,
          growthPercent: position.growthPercent,
        });
        totalInvested += position.bookValue;
      }
    });

    // Find all transactions for this account
    const recentTransactions: any[] = [];
    this.mockTransactions.forEach((tx) => {
      if (tx.details.accountId === accountId) {
        recentTransactions.push({
          id: tx.id,
          transactionType: tx.type,
          status: tx.status,
          amount: tx.details.amount,
          transactionDate: new Date().toISOString(),
        });
      }
    });

    // Calculate balances
    const cashBalance = 0; // Mock: all cash invested
    const totalValue = totalInvested + cashBalance;

    return {
      accountId,
      firmId,
      accountName: account.name,
      wrapperType: account.wrapperDetail.wrapperType,
      currency: account.currency,
      cashBalance,
      totalValue,
      totalInvested,
      totalGrowth: 0,
      totalGrowthPercent: 0,
      positions,
      recentTransactions,
    };
  }

  private mockGetPosition(
    firmId: string,
    positionId: string,
  ): PositionDetailDto {
    const position = this.mockPositions.get(positionId);

    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    return position;
  }

  // ========== UTILITIES ==========

  private generateMockId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  private generatePositionId(accountId: string, assetId: string): string {
    return `${accountId}|S|${assetId}`;
  }
}
