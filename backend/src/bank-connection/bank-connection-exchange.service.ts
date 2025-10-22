import {
  Injectable,
  ConflictException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BaseService } from '../common/base/base.service';
import { LoggerService } from '../common/logging/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { PlaidService } from '../plaid/plaid.service';
import { BankConnectionRepository } from './bank-connection.repository';
import { BankConnectionResponseDto } from './dto/bank-connection-response.dto';
import { BankConnectionMapper } from './mappers/bank-connection.mapper';

@Injectable()
export class BankConnectionExchangeService extends BaseService {
  protected readonly logger: LoggerService;
  protected readonly prisma: PrismaClient;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly plaidService: PlaidService,
    private readonly bankConnectionRepository: BankConnectionRepository,
  ) {
    super();
    this.logger = logger;
    this.logger.setContext('BankConnectionExchangeService');
    this.prisma = prisma;
  }

  /**
   * Exchange public token and create bank connection
   * Idempotent: If itemId already exists for user, return existing connection
   */
  async exchangePublicToken(
    userId: string,
    publicToken: string,
  ): Promise<BankConnectionResponseDto> {
    this.logger.info('Exchanging public token for bank connection', {
      userId,
    });

    return this.executeInTransaction(async (tx) => {
      // 1. Exchange public token with Plaid
      const plaidResponse =
        await this.plaidService.exchangePublicToken(publicToken);

      this.logger.debug('Public token exchanged', {
        itemId: plaidResponse.item_id,
      });

      // 2. Check if connection already exists (idempotency)
      const existingConnection =
        await this.bankConnectionRepository.findByItemId(
          tx,
          plaidResponse.item_id,
        );

      if (existingConnection) {
        // Check if it belongs to the same user
        if (existingConnection.userId !== userId) {
          this.logger.warn('Item already connected to different user', {
            itemId: plaidResponse.item_id,
            existingUserId: existingConnection.userId,
            requestUserId: userId,
          });
          throw new ConflictException(
            'This bank account is already connected to another user',
          );
        }

        this.logger.info('Returning existing bank connection (idempotent)', {
          connectionId: existingConnection.id,
          itemId: plaidResponse.item_id,
        });

        // Return existing connection with accounts
        const connectionWithAccounts =
          await this.bankConnectionRepository.findById(
            tx,
            existingConnection.id,
          );
        return BankConnectionMapper.toResponseDto(connectionWithAccounts!);
      }

      // 3. Encrypt access token
      const encryptedAccessToken = this.encryptionService.encrypt(
        plaidResponse.access_token,
      );

      // 4. Create bank connection
      const connection = await this.bankConnectionRepository.create(tx, {
        userId,
        accessToken: encryptedAccessToken,
        itemId: plaidResponse.item_id,
        institutionId: plaidResponse.item_id, // We'll update this when we fetch accounts
      });

      this.logger.info('Bank connection created', {
        connectionId: connection.id,
        itemId: connection.itemId,
      });

      // 5. Fetch initial accounts from Plaid
      const accountsResponse = await this.plaidService.getAccounts(
        plaidResponse.access_token,
      );

      // 6. Store accounts
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

      await this.bankConnectionRepository.upsertAccounts(
        tx,
        connection.id,
        plaidAccounts,
      );

      // 7. Update connection with institution name
      const updatedConnection = await this.bankConnectionRepository.update(
        tx,
        connection.id,
        {
          institutionName: accountsResponse.item.institution_id || undefined,
          lastSyncedAt: new Date(),
          lastSyncStatus: 'SUCCESS',
        },
      );

      this.logger.info('Bank accounts synced', {
        connectionId: connection.id,
        accountCount: plaidAccounts.length,
      });

      // 8. Return response with accounts
      const finalConnection = await this.bankConnectionRepository.findById(
        tx,
        updatedConnection.id,
      );

      return BankConnectionMapper.toResponseDto(finalConnection!);
    });
  }
}
