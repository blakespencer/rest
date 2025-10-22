import { Injectable } from '@nestjs/common';
import { Prisma, BankAccount } from '@prisma/client';
import { BaseRepository } from '../common/base/base.repository';
import { LoggerService } from '../common/logging/logger.service';

@Injectable()
export class BankAccountRepository extends BaseRepository {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
  }
  /**
   * Find all accounts for a user across all their bank connections
   */
  async findByUserId(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<BankAccount[]> {
    return tx.bankAccount.findMany({
      where: {
        bankConnection: {
          userId,
          deletedAt: null, // Only non-deleted connections
        },
      },
      include: {
        bankConnection: {
          select: {
            institutionName: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Find single account by ID with ownership check
   */
  async findById(
    tx: Prisma.TransactionClient,
    accountId: string,
  ) {
    return tx.bankAccount.findUnique({
      where: { id: accountId },
      include: {
        bankConnection: true,
      },
    });
  }

  /**
   * Find accounts by bank connection ID
   */
  async findByConnectionId(
    tx: Prisma.TransactionClient,
    connectionId: string,
  ): Promise<BankAccount[]> {
    return tx.bankAccount.findMany({
      where: { bankConnectionId: connectionId },
      orderBy: {
        name: 'asc',
      },
    });
  }

  /**
   * Calculate consolidated balance for user across all accounts
   */
  async getConsolidatedBalance(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: string = 'USD',
  ): Promise<{
    totalAvailable: number;
    totalCurrent: number;
    accounts: BankAccount[];
  }> {
    const accounts = await tx.bankAccount.findMany({
      where: {
        isoCurrencyCode: currency,
        bankConnection: {
          userId,
          deletedAt: null,
          status: 'ACTIVE',
        },
      },
      include: {
        bankConnection: {
          select: {
            institutionName: true,
          },
        },
      },
    });

    const totalAvailable = accounts.reduce(
      (sum, acc) => sum + (acc.availableBalance || 0),
      0,
    );
    const totalCurrent = accounts.reduce(
      (sum, acc) => sum + (acc.currentBalance || 0),
      0,
    );

    return {
      totalAvailable,
      totalCurrent,
      accounts,
    };
  }
}
