import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BaseService } from '../common/base/base.service';
import { LoggerService } from '../common/logging/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { PlaidService } from '../plaid/plaid.service';
import { BankConnectionRepository } from './bank-connection.repository';
import { TransactionRepository } from '../transaction/transaction.repository';
import { BankConnectionResponseDto } from './dto/bank-connection-response.dto';
import { BankConnectionMapper } from './mappers/bank-connection.mapper';

@Injectable()
export class BankConnectionSyncService extends BaseService {
  protected readonly logger: LoggerService;
  protected readonly prisma: PrismaClient;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly plaidService: PlaidService,
    private readonly bankConnectionRepository: BankConnectionRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {
    super();
    this.logger = logger;
    this.logger.setContext('BankConnectionSyncService');
    this.prisma = prisma;
  }

  /**
   * Sync bank connection (refresh account balances and transactions from Plaid)
   * Ensures user owns the connection
   */
  async sync(
    userId: string,
    connectionId: string,
  ): Promise<BankConnectionResponseDto> {
    this.logger.info('Syncing bank connection', { userId, connectionId });

    return this.executeInTransaction(async (tx) => {
      // 1. Get connection and verify ownership
      const connection = await this.bankConnectionRepository.findById(
        tx,
        connectionId,
      );

      if (!connection) {
        throw new NotFoundException('Bank connection not found');
      }

      if (connection.userId !== userId) {
        this.logger.warn('Unauthorized sync attempt on bank connection', {
          userId,
          connectionId,
          ownerId: connection.userId,
        });
        throw new ForbiddenException(
          'You do not have access to this connection',
        );
      }

      // 2. Decrypt access token
      const accessToken = this.encryptionService.decrypt(connection.accessToken);

      // 3. Fetch latest account data from Plaid
      const accountsResponse = await this.plaidService.getAccounts(accessToken);

      // 4. Map and update accounts
      const plaidAccounts = accountsResponse.accounts.map((account) => ({
        plaidAccountId: account.account_id,
        name: account.name,
        officialName: account.official_name,
        type: account.type,
        subtype: account.subtype,
        mask: account.mask,
        currentBalance: account.balances.current
          ? Math.round(account.balances.current * 100)
          : null,
        availableBalance: account.balances.available
          ? Math.round(account.balances.available * 100)
          : null,
        isoCurrencyCode: account.balances.iso_currency_code || 'USD',
      }));

      const updatedAccounts = await this.bankConnectionRepository.upsertAccounts(
        tx,
        connection.id,
        plaidAccounts,
      );

      // 5. Fetch and sync transactions (last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const transactionsResponse = await this.plaidService.getTransactions(
        accessToken,
        startDate.toISOString().split('T')[0], // YYYY-MM-DD
        endDate.toISOString().split('T')[0],
      );

      // 6. Create account lookup map for transaction mapping
      const accountLookup = new Map(
        updatedAccounts.map((acc) => [acc.plaidAccountId, acc.id]),
      );

      // 7. Map transactions to our domain model
      const transactions = transactionsResponse.transactions
        .filter((tx) => accountLookup.has(tx.account_id))
        .map((tx) => ({
          bankAccountId: accountLookup.get(tx.account_id)!,
          plaidTransactionId: tx.transaction_id,
          amount: Math.round(tx.amount * 100), // Convert to cents
          isoCurrencyCode: tx.iso_currency_code || 'USD',
          date: new Date(tx.date),
          name: tx.name,
          merchantName: tx.merchant_name || undefined,
          pending: tx.pending,
          category: tx.category || undefined,
          paymentChannel: tx.payment_channel,
        }));

      // 8. Upsert transactions (deduplication by plaidTransactionId)
      await this.transactionRepository.upsertTransactions(tx, transactions);

      // 9. Update sync status
      const updatedConnection = await this.bankConnectionRepository.update(
        tx,
        connection.id,
        {
          lastSyncedAt: new Date(),
          lastSyncStatus: 'SUCCESS',
        },
      );

      this.logger.info('Bank connection synced', {
        connectionId,
        accountCount: plaidAccounts.length,
        transactionCount: transactions.length,
      });

      // 10. Return updated connection with accounts
      const finalConnection = await this.bankConnectionRepository.findById(
        tx,
        updatedConnection.id,
      );

      return BankConnectionMapper.toResponseDto(finalConnection!);
    });
  }
}
