import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../common/logging/logger.service';
import { BaseService } from '../common/base/base.service';
import { SecclService } from '../seccl/seccl.service';
import { SecclAccountRepository } from './seccl-account.repository';
import { InvestmentOrderRepository } from './investment-order.repository';
import { InvestmentPositionRepository } from './investment-position.repository';
import { InvestmentOrderExecutionService } from './investment-order-execution.service';
import {
  CreateSecclAccountDto,
  WrapperType,
} from '../seccl/dto/create-account.dto';

/**
 * Investment Service - Orchestrates complete investment flow
 *
 * Flow: Create Account → Fund Account → Place Order → Complete Order → View Position
 */
@Injectable()
export class InvestmentService extends BaseService {
  protected readonly logger: LoggerService;
  protected readonly prisma: PrismaService;

  // Configuration (would come from ConfigService in production)
  private readonly FIRM_ID = 'MOCK_FIRM';
  private readonly NODE_ID = '0';
  private readonly DEFAULT_CURRENCY = 'GBP';
  private readonly MONEY_MARKET_FUND_ID = '275F1'; // Mock Seccl asset ID
  private readonly MONEY_MARKET_FUND_NAME = 'Money Market Fund';
  private readonly SHARE_PRICE = 2.27; // Mock price per share in GBP

  constructor(
    prisma: PrismaService,
    logger: LoggerService,
    private readonly secclService: SecclService,
    private readonly secclAccountRepo: SecclAccountRepository,
    private readonly investmentOrderRepo: InvestmentOrderRepository,
    private readonly investmentPositionRepo: InvestmentPositionRepository,
    private readonly orderExecutionService: InvestmentOrderExecutionService,
  ) {
    super();
    this.prisma = prisma;
    this.logger = logger;
    this.logger.setContext('InvestmentService');
  }

  /**
   * Create Seccl Investment Account
   * Step 1: POST /account
   */
  async createAccount(
    userId: string,
    accountName: string,
    wrapperType: WrapperType,
  ) {
    this.logger.info('Creating Seccl account', { userId, wrapperType });

    return this.executeInTransaction(async (tx) => {
      // Generate unique client ID
      const clientId = `CLIENT-${Date.now()}`;

      // Call Seccl API to create account
      const secclDto: CreateSecclAccountDto = {
        firmId: this.FIRM_ID,
        nodeId: this.NODE_ID,
        accountType: 'Wrapper',
        name: accountName,
        status: 'Active',
        currency: this.DEFAULT_CURRENCY,
        clientId,
        wrapperDetail: {
          wrapperType,
        },
      };

      const secclResponse = await this.executeApiCall(
        'Seccl',
        'createAccount',
        () => this.secclService.createAccount(secclDto),
        { userId, wrapperType },
      );

      // Store in database
      const account = await this.secclAccountRepo.create(tx, {
        userId,
        secclAccountId: secclResponse.id,
        secclClientId: clientId,
        firmId: this.FIRM_ID,
        accountName,
        accountType: 'Wrapper',
        wrapperType,
        currency: this.DEFAULT_CURRENCY,
        status: 'Active',
      });

      this.logger.info('Seccl account created', {
        accountId: account.id,
        secclAccountId: account.secclAccountId,
      });

      return {
        id: account.id,
        secclAccountId: account.secclAccountId,
        accountName: account.accountName,
        wrapperType: account.wrapperType,
        currency: account.currency,
        status: account.status,
        createdAt: account.createdAt,
      };
    });
  }

  /**
   * Get all Seccl accounts for a user
   */
  async getAccounts(userId: string) {
    return this.executeInTransaction(async (tx) => {
      const accounts = await this.secclAccountRepo.findByUserId(tx, userId);

      return accounts.map((account: any) => ({
        id: account.id,
        secclAccountId: account.secclAccountId,
        accountName: account.accountName,
        wrapperType: account.wrapperType,
        currency: account.currency,
        cashBalance: account.cashBalance,
        totalValue: account.totalValue,
        status: account.status,
        positionCount: account.positions?.length || 0,
        createdAt: account.createdAt,
      }));
    });
  }

  /**
   * Create Investment Order (Full Flow)
   *
   * Orchestrates the complete investment flow with all steps delegated
   * to specialized services for better separation of concerns.
   */
  async createInvestmentOrder(
    userId: string,
    secclAccountId: string,
    amount: number,
    idempotencyKey: string,
  ) {
    this.logger.info('Creating investment order', {
      userId,
      secclAccountId,
      amount,
      idempotencyKey,
    });

    return this.executeInTransaction(async (tx) => {
      // 1. Validate account ownership
      const account = await this.validateAccountOwnership(
        tx,
        userId,
        secclAccountId,
      );

      // 2. Check idempotency
      const existingOrder = await this.checkIdempotency(tx, idempotencyKey);
      if (existingOrder) {
        return this.mapOrderToResponse(existingOrder);
      }

      // 3. Create transaction group (payment + order)
      const { order, paymentId, orderId, orderAmount } =
        await this.orderExecutionService.createTransactionGroup(
          tx,
          account.id,
          account.secclAccountId,
          amount,
          userId,
          idempotencyKey,
        );

      // 4. Complete payment
      await this.orderExecutionService.completePayment(tx, order.id, paymentId);

      // 5. Complete order
      const { completedOrder, executedQuantity, executedAmount } =
        await this.orderExecutionService.completeOrder(
          tx,
          order.id,
          orderId,
          orderAmount,
        );

      // 6. Update position (accumulate shares)
      await this.orderExecutionService.updatePosition(
        tx,
        userId,
        account.id,
        account.secclAccountId,
        executedQuantity,
        executedAmount,
      );

      this.logger.info('Investment order completed', {
        orderId: completedOrder.id,
        executedQuantity,
        executedAmount,
      });

      return this.mapOrderToResponse(completedOrder);
    });
  }

  /**
   * Validate account exists and belongs to user
   */
  private async validateAccountOwnership(
    tx: any,
    userId: string,
    secclAccountId: string,
  ) {
    const account = await this.secclAccountRepo.findById(tx, secclAccountId);

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Seccl account not found');
    }

    return account;
  }

  /**
   * Check for existing order with same idempotency key
   */
  private async checkIdempotency(tx: any, idempotencyKey: string) {
    const existingOrder = await this.investmentOrderRepo.findByIdempotencyKey(
      tx,
      idempotencyKey,
    );

    if (existingOrder) {
      this.logger.info('Returning existing order (idempotent)', {
        orderId: existingOrder.id,
        idempotencyKey,
      });
    }

    return existingOrder;
  }

  /**
   * Get account summary with positions
   */
  async getAccountSummary(userId: string, secclAccountId: string) {
    return this.executeInTransaction(async (tx) => {
      const account = await this.secclAccountRepo.findById(tx, secclAccountId);

      if (!account) {
        throw new NotFoundException('Seccl account not found');
      }

      if (account.userId !== userId) {
        throw new NotFoundException('Seccl account not found');
      }

      // Get summary from Seccl
      const summary = await this.executeApiCall(
        'Seccl',
        'getAccountSummary',
        () =>
          this.secclService.getAccountSummary(
            this.FIRM_ID,
            account.secclAccountId,
          ),
        { secclAccountId },
      );

      return summary;
    });
  }

  /**
   * Get investment orders for a user
   */
  async getOrders(userId: string, secclAccountId?: string) {
    return this.executeInTransaction(async (tx) => {
      const orders = secclAccountId
        ? await this.investmentOrderRepo.findBySecclAccountId(tx, secclAccountId)
        : await this.investmentOrderRepo.findByUserId(tx, userId);

      return orders.map((order) => this.mapOrderToResponse(order));
    });
  }

  /**
   * Get positions for a user
   */
  async getPositions(userId: string, secclAccountId?: string) {
    return this.executeInTransaction(async (tx) => {
      const positions = secclAccountId
        ? await this.investmentPositionRepo.findBySecclAccountId(tx, secclAccountId)
        : await this.investmentPositionRepo.findByUserId(tx, userId);

      return positions.map((position) => ({
        id: position.id,
        secclPositionId: position.secclPositionId,
        fundId: position.fundId,
        fundName: position.fundName,
        isin: position.isin,
        quantity: position.quantity,
        bookValue: position.bookValue,
        currentValue: position.currentValue,
        growth: position.growth,
        growthPercent: position.growthPercent,
        currency: position.currency,
        lastUpdatedAt: position.lastUpdatedAt,
      }));
    });
  }

  // ========== UTILITIES ==========

  private mapOrderToResponse(order: any) {
    return {
      id: order.id,
      fundId: order.fundId,
      fundName: order.fundName,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      executedAt: order.executedAt,
      executedQuantity: order.executedQuantity,
      executionPrice: order.executionPrice,
      executedAmount: order.executedAmount,
      createdAt: order.createdAt,
    };
  }
}
