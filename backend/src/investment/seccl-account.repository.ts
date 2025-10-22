import { Injectable } from '@nestjs/common';
import { Prisma, SecclAccount } from '@prisma/client';
import { BaseRepository } from '../common/base/base.repository';
import { LoggerService } from '../common/logging/logger.service';

export interface CreateSecclAccountData {
  userId: string;
  secclAccountId: string;
  secclClientId: string;
  firmId: string;
  accountName: string;
  accountType: string;
  wrapperType: string;
  currency: string;
  status: string;
}

export interface UpdateSecclAccountData {
  cashBalance?: number;
  totalValue?: number;
  status?: string;
}

@Injectable()
export class SecclAccountRepository extends BaseRepository {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
    this.logger.setContext('SecclAccountRepository');
  }

  /**
   * Create new Seccl account
   */
  async create(
    tx: Prisma.TransactionClient,
    data: CreateSecclAccountData,
  ): Promise<SecclAccount> {
    return tx.secclAccount.create({
      data,
    });
  }

  /**
   * Find by internal ID
   */
  async findById(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<SecclAccount | null> {
    return tx.secclAccount.findUnique({
      where: { id },
      include: {
        positions: true,
        investmentOrders: true,
      },
    });
  }

  /**
   * Find by Seccl account ID
   */
  async findBySecclAccountId(
    tx: Prisma.TransactionClient,
    secclAccountId: string,
  ): Promise<SecclAccount | null> {
    return tx.secclAccount.findUnique({
      where: { secclAccountId },
    });
  }

  /**
   * Find all accounts for a user
   */
  async findByUserId(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<SecclAccount[]> {
    return tx.secclAccount.findMany({
      where: { userId },
      include: {
        positions: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Update account balances
   */
  async update(
    tx: Prisma.TransactionClient,
    id: string,
    data: UpdateSecclAccountData,
  ): Promise<SecclAccount> {
    return tx.secclAccount.update({
      where: { id },
      data,
    });
  }
}
