import { Injectable } from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import { BaseRepository } from '../common/base/base.repository';
import { LoggerService } from '../common/logging/logger.service';

export interface CreateTransactionData {
  bankAccountId: string;
  plaidTransactionId: string;
  amount: number; // In cents
  isoCurrencyCode: string;
  date: Date;
  name: string;
  merchantName?: string;
  pending: boolean;
  category?: string[];
  paymentChannel?: string;
}

@Injectable()
export class TransactionRepository extends BaseRepository {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
  }

  /**
   * Find transactions for a specific bank account
   * @param tx - Prisma transaction client
   * @param bankAccountId - Bank account ID
   * @param limit - Optional limit for pagination
   * @param offset - Optional offset for pagination
   */
  async findByBankAccountId(
    tx: Prisma.TransactionClient,
    bankAccountId: string,
    limit?: number,
    offset?: number,
  ): Promise<Transaction[]> {
    return tx.transaction.findMany({
      where: {
        bankAccountId,
      },
      orderBy: {
        date: 'desc',
      },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Find transaction by Plaid transaction ID (for deduplication)
   * @param tx - Prisma transaction client
   * @param plaidTransactionId - Plaid's unique transaction ID
   */
  async findByPlaidTransactionId(
    tx: Prisma.TransactionClient,
    plaidTransactionId: string,
  ): Promise<Transaction | null> {
    return tx.transaction.findUnique({
      where: {
        plaidTransactionId,
      },
    });
  }

  /**
   * Upsert transactions with deduplication by plaidTransactionId
   * This prevents duplicate transactions and updates pending → posted status
   * @param tx - Prisma transaction client
   * @param transactions - Array of transactions to upsert
   */
  async upsertTransactions(
    tx: Prisma.TransactionClient,
    transactions: CreateTransactionData[],
  ): Promise<Transaction[]> {
    const upsertedTransactions: Transaction[] = [];

    for (const transaction of transactions) {
      const upserted = await tx.transaction.upsert({
        where: {
          plaidTransactionId: transaction.plaidTransactionId,
        },
        update: {
          // Update fields that may change (pending → posted, amount adjustments)
          amount: transaction.amount,
          pending: transaction.pending,
          name: transaction.name,
          merchantName: transaction.merchantName,
          category: transaction.category,
          date: transaction.date,
        },
        create: {
          bankAccountId: transaction.bankAccountId,
          plaidTransactionId: transaction.plaidTransactionId,
          amount: transaction.amount,
          isoCurrencyCode: transaction.isoCurrencyCode,
          date: transaction.date,
          name: transaction.name,
          merchantName: transaction.merchantName,
          pending: transaction.pending,
          category: transaction.category,
          paymentChannel: transaction.paymentChannel,
        },
      });

      upsertedTransactions.push(upserted);
    }

    this.logger.info('Transactions upserted', {
      count: upsertedTransactions.length,
    });

    return upsertedTransactions;
  }

  /**
   * Count transactions for a bank account
   * @param tx - Prisma transaction client
   * @param bankAccountId - Bank account ID
   */
  async countByBankAccountId(
    tx: Prisma.TransactionClient,
    bankAccountId: string,
  ): Promise<number> {
    return tx.transaction.count({
      where: {
        bankAccountId,
      },
    });
  }

  /**
   * Find transactions within a date range
   * @param tx - Prisma transaction client
   * @param bankAccountId - Bank account ID
   * @param startDate - Start date
   * @param endDate - End date
   */
  async findByDateRange(
    tx: Prisma.TransactionClient,
    bankAccountId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    return tx.transaction.findMany({
      where: {
        bankAccountId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });
  }
}
