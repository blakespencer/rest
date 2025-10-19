import { Injectable } from '@nestjs/common';
import { Prisma, BankConnection, BankAccount } from '@prisma/client';
import { BaseRepository } from '../common/base/base.repository';

export interface CreateBankConnectionData {
  userId: string;
  accessToken: string; // Already encrypted
  itemId: string;
  institutionId: string;
  institutionName?: string;
}

export interface UpdateBankConnectionData {
  status?: string;
  lastSyncedAt?: Date;
  lastSyncStatus?: string;
  institutionName?: string;
}

@Injectable()
export class BankConnectionRepository extends BaseRepository {
  /**
   * Find bank connection by ID (non-deleted only)
   */
  async findById(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<(BankConnection & { accounts: BankAccount[] }) | null> {
    return tx.bankConnection.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        accounts: true,
      },
    });
  }

  /**
   * Find all bank connections for a user (non-deleted only)
   */
  async findByUserId(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<(BankConnection & { accounts: BankAccount[] })[]> {
    return tx.bankConnection.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      include: {
        accounts: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Find bank connection by Plaid item ID
   */
  async findByItemId(
    tx: Prisma.TransactionClient,
    itemId: string,
  ): Promise<BankConnection | null> {
    return tx.bankConnection.findFirst({
      where: {
        itemId,
        deletedAt: null,
      },
    });
  }

  /**
   * Create a new bank connection
   */
  async create(
    tx: Prisma.TransactionClient,
    data: CreateBankConnectionData,
  ): Promise<BankConnection> {
    return tx.bankConnection.create({
      data: {
        userId: data.userId,
        accessToken: data.accessToken,
        itemId: data.itemId,
        institutionId: data.institutionId,
        institutionName: data.institutionName,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Update bank connection
   */
  async update(
    tx: Prisma.TransactionClient,
    id: string,
    data: UpdateBankConnectionData,
  ): Promise<BankConnection> {
    return tx.bankConnection.update({
      where: { id },
      data,
    });
  }

  /**
   * Soft delete bank connection
   */
  async softDelete(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<BankConnection> {
    return tx.bankConnection.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'DISCONNECTED',
      },
    });
  }

  /**
   * Create or update bank accounts for a connection
   */
  async upsertAccounts(
    tx: Prisma.TransactionClient,
    bankConnectionId: string,
    accounts: Array<{
      plaidAccountId: string;
      name: string;
      officialName?: string | null;
      type: string;
      subtype?: string | null;
      mask?: string | null;
      currentBalance?: number | null;
      availableBalance?: number | null;
      isoCurrencyCode?: string;
    }>,
  ): Promise<BankAccount[]> {
    const upsertedAccounts: BankAccount[] = [];

    for (const account of accounts) {
      const upserted = await tx.bankAccount.upsert({
        where: {
          plaidAccountId: account.plaidAccountId,
        },
        update: {
          name: account.name,
          officialName: account.officialName,
          type: account.type,
          subtype: account.subtype,
          mask: account.mask,
          currentBalance: account.currentBalance,
          availableBalance: account.availableBalance,
          isoCurrencyCode: account.isoCurrencyCode || 'USD',
        },
        create: {
          bankConnectionId,
          plaidAccountId: account.plaidAccountId,
          name: account.name,
          officialName: account.officialName,
          type: account.type,
          subtype: account.subtype,
          mask: account.mask,
          currentBalance: account.currentBalance,
          availableBalance: account.availableBalance,
          isoCurrencyCode: account.isoCurrencyCode || 'USD',
        },
      });

      upsertedAccounts.push(upserted);
    }

    return upsertedAccounts;
  }
}
