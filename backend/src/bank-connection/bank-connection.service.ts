import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BaseService } from '../common/base/base.service';
import { LoggerService } from '../common/logging/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { BankConnectionRepository } from './bank-connection.repository';
import { BankConnectionExchangeService } from './bank-connection-exchange.service';
import { BankConnectionSyncService } from './bank-connection-sync.service';
import { BankConnectionResponseDto } from './dto/bank-connection-response.dto';
import { BankConnectionMapper } from './mappers/bank-connection.mapper';

@Injectable()
export class BankConnectionService extends BaseService {
  protected readonly logger: LoggerService;
  protected readonly prisma: PrismaClient;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    private readonly bankConnectionRepository: BankConnectionRepository,
    private readonly exchangeService: BankConnectionExchangeService,
    private readonly syncService: BankConnectionSyncService,
  ) {
    super();
    this.logger = logger;
    this.logger.setContext('BankConnectionService');
    this.prisma = prisma;
  }

  /**
   * Exchange public token and create bank connection
   * Delegates to BankConnectionExchangeService
   */
  async exchangePublicToken(
    userId: string,
    publicToken: string,
  ): Promise<BankConnectionResponseDto> {
    return this.exchangeService.exchangePublicToken(userId, publicToken);
  }

  /**
   * Get all bank connections for a user
   */
  async findByUserId(userId: string): Promise<BankConnectionResponseDto[]> {
    this.logger.debug('Finding bank connections for user', { userId });

    return this.executeInTransaction(async (tx) => {
      const connections =
        await this.bankConnectionRepository.findByUserId(tx, userId);

      return BankConnectionMapper.toResponseDtoList(connections);
    });
  }

  /**
   * Get single bank connection by ID
   * Ensures user owns the connection
   */
  async findById(
    userId: string,
    connectionId: string,
  ): Promise<BankConnectionResponseDto> {
    this.logger.debug('Finding bank connection', { userId, connectionId });

    return this.executeInTransaction(async (tx) => {
      const connection = await this.bankConnectionRepository.findById(
        tx,
        connectionId,
      );

      if (!connection) {
        throw new NotFoundException('Bank connection not found');
      }

      // Verify ownership
      if (connection.userId !== userId) {
        this.logger.warn('Unauthorized access attempt to bank connection', {
          userId,
          connectionId,
          ownerId: connection.userId,
        });
        throw new ForbiddenException(
          'You do not have access to this connection',
        );
      }

      return BankConnectionMapper.toResponseDto(connection);
    });
  }

  /**
   * Soft delete bank connection
   * Ensures user owns the connection
   */
  async delete(userId: string, connectionId: string): Promise<void> {
    this.logger.info('Deleting bank connection', { userId, connectionId });

    return this.executeInTransaction(async (tx) => {
      const connection = await this.bankConnectionRepository.findById(
        tx,
        connectionId,
      );

      if (!connection) {
        throw new NotFoundException('Bank connection not found');
      }

      // Verify ownership
      if (connection.userId !== userId) {
        this.logger.warn('Unauthorized delete attempt on bank connection', {
          userId,
          connectionId,
          ownerId: connection.userId,
        });
        throw new ForbiddenException(
          'You do not have access to this connection',
        );
      }

      await this.bankConnectionRepository.softDelete(tx, connectionId);

      this.logger.info('Bank connection deleted', { connectionId });
    });
  }

  /**
   * Sync bank connection (refresh account balances and transactions)
   * Delegates to BankConnectionSyncService
   */
  async sync(
    userId: string,
    connectionId: string,
  ): Promise<BankConnectionResponseDto> {
    return this.syncService.sync(userId, connectionId);
  }
}
