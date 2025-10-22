import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BaseService } from '../common/base/base.service';
import { LoggerService } from '../common/logging/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { BankAccountRepository } from './bank-account.repository';
import { TransactionRepository } from '../transaction/transaction.repository';
import {
  BankAccountResponseDto,
  ConsolidatedBalanceDto,
} from './dto/bank-account-response.dto';
import {
  TransactionResponseDto,
  TransactionListResponseDto,
} from '../transaction/dto/transaction-response.dto';

@Injectable()
export class BankAccountService extends BaseService {
  protected readonly logger: LoggerService;
  protected readonly prisma: PrismaClient;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {
    super();
    this.logger = logger;
    this.logger.setContext('BankAccountService');
    this.prisma = prisma as PrismaClient;
  }

  /**
   * Get all bank accounts for authenticated user
   */
  async findByUserId(userId: string): Promise<BankAccountResponseDto[]> {
    this.logger.debug('Finding bank accounts for user', { userId });

    return this.executeInTransaction(async (tx) => {
      const accounts = await this.bankAccountRepository.findByUserId(
        tx,
        userId,
      );

      return accounts.map((account) => ({
        id: account.id,
        bankConnectionId: account.bankConnectionId,
        plaidAccountId: account.plaidAccountId,
        name: account.name,
        officialName: account.officialName || undefined,
        type: account.type,
        subtype: account.subtype || undefined,
        mask: account.mask || undefined,
        currentBalance: account.currentBalance || 0,
        availableBalance: account.availableBalance || 0,
        isoCurrencyCode: account.isoCurrencyCode,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      }));
    });
  }

  /**
   * Get single bank account by ID with ownership validation
   */
  async findById(
    userId: string,
    accountId: string,
  ): Promise<BankAccountResponseDto> {
    this.logger.debug('Finding bank account', { userId, accountId });

    return this.executeInTransaction(async (tx) => {
      const account = await this.bankAccountRepository.findById(tx, accountId);

      if (!account) {
        throw new NotFoundException('Bank account not found');
      }

      // Check ownership
      if (account.bankConnection.userId !== userId) {
        this.logger.warn('Unauthorized bank account access attempt', {
          userId,
          accountId,
          ownerId: account.bankConnection.userId,
        });
        throw new ForbiddenException(
          'You do not have access to this bank account',
        );
      }

      return {
        id: account.id,
        bankConnectionId: account.bankConnectionId,
        plaidAccountId: account.plaidAccountId,
        name: account.name,
        officialName: account.officialName || undefined,
        type: account.type,
        subtype: account.subtype || undefined,
        mask: account.mask || undefined,
        currentBalance: account.currentBalance || 0,
        availableBalance: account.availableBalance || 0,
        isoCurrencyCode: account.isoCurrencyCode,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      };
    });
  }

  /**
   * Get consolidated balance across all user's accounts
   */
  async getConsolidatedBalance(
    userId: string,
    currency: string = 'USD',
  ): Promise<ConsolidatedBalanceDto> {
    this.logger.debug('Getting consolidated balance', { userId, currency });

    return this.executeInTransaction(async (tx) => {
      const { totalAvailable, totalCurrent, accounts } =
        await this.bankAccountRepository.getConsolidatedBalance(
          tx,
          userId,
          currency,
        );

      return {
        totalAvailable,
        totalCurrent,
        currency,
        accountCount: accounts.length,
        accounts: accounts.map((acc) => ({
          id: acc.id,
          name: acc.name,
          mask: acc.mask || undefined,
          availableBalance: acc.availableBalance || 0,
          currentBalance: acc.currentBalance || 0,
        })),
      };
    });
  }

  /**
   * Get transactions for a bank account with ownership validation
   * @param userId - User ID from JWT
   * @param accountId - Bank account ID
   * @param page - Page number (default: 1)
   * @param pageSize - Items per page (default: 50, max: 100)
   */
  async getTransactions(
    userId: string,
    accountId: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<TransactionListResponseDto> {
    this.logger.debug('Getting transactions for account', {
      userId,
      accountId,
      page,
      pageSize,
    });

    // Validate pagination parameters
    const validatedPageSize = Math.min(Math.max(pageSize, 1), 100);
    const validatedPage = Math.max(page, 1);
    const offset = (validatedPage - 1) * validatedPageSize;

    return this.executeInTransaction(async (tx) => {
      // 1. Verify account exists and user owns it
      const account = await this.bankAccountRepository.findById(tx, accountId);

      if (!account) {
        throw new NotFoundException('Bank account not found');
      }

      if (account.bankConnection.userId !== userId) {
        this.logger.warn('Unauthorized transaction access attempt', {
          userId,
          accountId,
          ownerId: account.bankConnection.userId,
        });
        throw new ForbiddenException(
          'You do not have access to this bank account',
        );
      }

      // 2. Get transactions with pagination
      const transactions = await this.transactionRepository.findByBankAccountId(
        tx,
        accountId,
        validatedPageSize,
        offset,
      );

      // 3. Get total count
      const total = await this.transactionRepository.countByBankAccountId(
        tx,
        accountId,
      );

      // 4. Map to DTOs
      const transactionDtos: TransactionResponseDto[] = transactions.map(
        (transaction) => ({
          id: transaction.id,
          bankAccountId: transaction.bankAccountId,
          plaidTransactionId: transaction.plaidTransactionId,
          amount: transaction.amount,
          isoCurrencyCode: transaction.isoCurrencyCode,
          date: transaction.date,
          name: transaction.name,
          merchantName: transaction.merchantName || undefined,
          pending: transaction.pending,
          category: transaction.category as string[] | undefined,
          paymentChannel: transaction.paymentChannel || undefined,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
        }),
      );

      return {
        transactions: transactionDtos,
        total,
        page: validatedPage,
        pageSize: validatedPageSize,
        hasMore: offset + validatedPageSize < total,
      };
    });
  }
}
