import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LoggerService } from '../common/logging/logger.service';
import { SecclService } from '../seccl/seccl.service';
import { InvestmentOrderRepository } from './investment-order.repository';
import { InvestmentPositionRepository } from './investment-position.repository';
import { TransactionType } from '../seccl/dto/transaction-group.dto';

/**
 * Investment Order Execution Service
 *
 * Handles the execution of investment orders:
 * - Creating transaction groups (payment + order)
 * - Completing payments
 * - Completing orders with execution details
 * - Updating positions
 *
 * Extracted from InvestmentService to comply with 70-line function limit
 */
@Injectable()
export class InvestmentOrderExecutionService {
  // Configuration (would come from ConfigService in production)
  private readonly FIRM_ID = 'MOCK_FIRM';
  private readonly DEFAULT_CURRENCY = 'GBP';
  private readonly MONEY_MARKET_FUND_ID = '275F1';
  private readonly MONEY_MARKET_FUND_NAME = 'Money Market Fund';
  private readonly SHARE_PRICE = 2.27;
  private readonly FEE_PERCENTAGE = 0.02; // 2% fee

  constructor(
    private readonly logger: LoggerService,
    private readonly secclService: SecclService,
    private readonly investmentOrderRepo: InvestmentOrderRepository,
    private readonly investmentPositionRepo: InvestmentPositionRepository,
  ) {
    this.logger.setContext('InvestmentOrderExecutionService');
  }

  /**
   * Create transaction group (payment + order) in Seccl
   */
  async createTransactionGroup(
    tx: Prisma.TransactionClient,
    accountId: string,
    secclAccountId: string,
    amount: number,
    userId: string,
    idempotencyKey: string,
  ) {
    const paymentAmount = amount;
    const orderAmount = Math.floor(amount * (1 - this.FEE_PERCENTAGE));

    const transactionGroupResponse =
      await this.secclService.createTransactionGroup({
        firmId: this.FIRM_ID,
        accountId: secclAccountId,
        transactions: [
          {
            firmId: this.FIRM_ID,
            accountId: secclAccountId,
            transactionType: TransactionType.Payment,
            transactionSubType: 'Deposit' as any,
            movementType: 'In' as any,
            currency: this.DEFAULT_CURRENCY,
            amount: paymentAmount,
            method: 'Bank Transfer',
          },
          {
            firmId: this.FIRM_ID,
            accountId: secclAccountId,
            transactionType: TransactionType.Order,
            transactionSubType: 'At Best' as any,
            movementType: 'Invest' as any,
            currency: this.DEFAULT_CURRENCY,
            amount: orderAmount,
            assetId: this.MONEY_MARKET_FUND_ID,
          },
        ],
      });

    const paymentId =
      transactionGroupResponse.transactions.find(
        (t) => t.transactionType === TransactionType.Payment,
      )?.id || '';

    const orderId =
      transactionGroupResponse.transactions.find(
        (t) => t.transactionType === TransactionType.Order,
      )?.id || '';

    // Store order in database
    const order = await this.investmentOrderRepo.create(tx, {
      userId,
      secclAccountId: accountId,
      fundId: this.MONEY_MARKET_FUND_ID,
      fundName: this.MONEY_MARKET_FUND_NAME,
      amount: orderAmount,
      currency: this.DEFAULT_CURRENCY,
      idempotencyKey,
      linkId: transactionGroupResponse.linkId,
      paymentId,
      orderId,
    });

    return { order, paymentId, orderId, orderAmount };
  }

  /**
   * Complete payment transaction
   */
  async completePayment(
    tx: Prisma.TransactionClient,
    orderId: string,
    paymentId: string,
  ) {
    await this.secclService.completeTransaction(this.FIRM_ID, paymentId, {
      type: 'Action',
      firmId: this.FIRM_ID,
      transactionAction: 'Complete',
      actionReason: 'Payment received',
      completedDate: new Date().toISOString(),
    });

    await this.investmentOrderRepo.update(tx, orderId, {
      status: 'PAYMENT_COMPLETED',
    });
  }

  /**
   * Complete order transaction with execution details
   */
  async completeOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    secclOrderId: string,
    orderAmount: number,
  ) {
    const executedQuantity = Math.floor(
      orderAmount / (this.SHARE_PRICE * 100),
    );
    const executedAmount = executedQuantity * this.SHARE_PRICE * 100;

    await this.secclService.completeTransaction(this.FIRM_ID, secclOrderId, {
      type: 'Action',
      firmId: this.FIRM_ID,
      transactionAction: 'Complete',
      actionReason: 'Order executed',
      completedDate: new Date().toISOString(),
      executionDetails: {
        currency: this.DEFAULT_CURRENCY,
        price: this.SHARE_PRICE,
        transactionTime: '00:00:00',
        venue: 'XLON',
        executionAmount: executedAmount / 100,
        executedQuantity,
      },
      quantity: executedQuantity,
      amount: executedAmount / 100,
      transactionDate: new Date().toISOString(),
      intendedSettlementDate: new Date().toISOString(),
    });

    const completedOrder = await this.investmentOrderRepo.update(tx, orderId, {
      status: 'ORDER_COMPLETED',
      executedAt: new Date(),
      executedQuantity,
      executionPrice: this.SHARE_PRICE,
      executedAmount,
    });

    return { completedOrder, executedQuantity, executedAmount };
  }

  /**
   * Update position (create or accumulate)
   */
  async updatePosition(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId: string,
    secclAccountId: string,
    executedQuantity: number,
    executedAmount: number,
  ) {
    const positionId = `${secclAccountId}|S|${this.MONEY_MARKET_FUND_ID}`;

    const existingPosition =
      await this.investmentPositionRepo.findBySecclPositionId(tx, positionId);

    if (existingPosition) {
      // CRITICAL: Add to existing position, don't replace
      const newQuantity = existingPosition.quantity + executedQuantity;
      const newBookValue = existingPosition.bookValue + executedAmount;
      const newCurrentValue = existingPosition.currentValue + executedAmount;

      await this.investmentPositionRepo.update(tx, existingPosition.id, {
        quantity: newQuantity,
        bookValue: newBookValue,
        currentValue: newCurrentValue,
        growth: newCurrentValue - newBookValue,
        growthPercent: ((newCurrentValue - newBookValue) / newBookValue) * 100,
        lastUpdatedAt: new Date(),
      });
    } else {
      // Create new position
      await this.investmentPositionRepo.create(tx, {
        userId,
        secclAccountId: accountId,
        secclPositionId: positionId,
        fundId: this.MONEY_MARKET_FUND_ID,
        fundName: this.MONEY_MARKET_FUND_NAME,
        isin: 'GB00MOCK1234',
        quantity: executedQuantity,
        bookValue: executedAmount,
        currentValue: executedAmount,
        growth: 0,
        growthPercent: 0,
        currency: this.DEFAULT_CURRENCY,
      });
    }
  }
}
