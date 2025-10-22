import { Injectable } from '@nestjs/common';
import { Prisma, InvestmentOrder } from '@prisma/client';
import { BaseRepository } from '../common/base/base.repository';
import { LoggerService } from '../common/logging/logger.service';

export interface CreateInvestmentOrderData {
  userId: string;
  secclAccountId: string;
  fundId: string;
  fundName?: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  linkId?: string;
  paymentId?: string;
  orderId?: string;
}

export interface UpdateInvestmentOrderData {
  status?: string;
  linkId?: string;
  paymentId?: string;
  orderId?: string;
  executedAt?: Date;
  executedQuantity?: number;
  executionPrice?: number;
  executedAmount?: number;
  failureReason?: string;
}

@Injectable()
export class InvestmentOrderRepository extends BaseRepository {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
    this.logger.setContext('InvestmentOrderRepository');
  }

  /**
   * Create new investment order
   */
  async create(
    tx: Prisma.TransactionClient,
    data: CreateInvestmentOrderData,
  ): Promise<InvestmentOrder> {
    return tx.investmentOrder.create({
      data,
    });
  }

  /**
   * Find by ID
   */
  async findById(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<InvestmentOrder | null> {
    return tx.investmentOrder.findUnique({
      where: { id },
    });
  }

  /**
   * Find by idempotency key (for duplicate detection)
   */
  async findByIdempotencyKey(
    tx: Prisma.TransactionClient,
    idempotencyKey: string,
  ): Promise<InvestmentOrder | null> {
    return tx.investmentOrder.findUnique({
      where: { idempotencyKey },
    });
  }

  /**
   * Find all orders for a user
   */
  async findByUserId(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<InvestmentOrder[]> {
    return tx.investmentOrder.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Find all orders for a Seccl account
   */
  async findBySecclAccountId(
    tx: Prisma.TransactionClient,
    secclAccountId: string,
  ): Promise<InvestmentOrder[]> {
    return tx.investmentOrder.findMany({
      where: { secclAccountId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Update order
   */
  async update(
    tx: Prisma.TransactionClient,
    id: string,
    data: UpdateInvestmentOrderData,
  ): Promise<InvestmentOrder> {
    return tx.investmentOrder.update({
      where: { id },
      data,
    });
  }
}
