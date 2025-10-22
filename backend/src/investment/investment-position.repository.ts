import { Injectable } from '@nestjs/common';
import { Prisma, InvestmentPosition } from '@prisma/client';
import { BaseRepository } from '../common/base/base.repository';
import { LoggerService } from '../common/logging/logger.service';

export interface CreateInvestmentPositionData {
  userId: string;
  secclAccountId: string;
  secclPositionId: string;
  fundId: string;
  fundName: string;
  isin?: string;
  quantity: number;
  bookValue: number;
  currentValue: number;
  growth: number;
  growthPercent: number;
  currency: string;
}

export interface UpdateInvestmentPositionData {
  quantity?: number;
  bookValue?: number;
  currentValue?: number;
  growth?: number;
  growthPercent?: number;
  lastUpdatedAt?: Date;
}

@Injectable()
export class InvestmentPositionRepository extends BaseRepository {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
    this.logger.setContext('InvestmentPositionRepository');
  }

  /**
   * Create new position
   */
  async create(
    tx: Prisma.TransactionClient,
    data: CreateInvestmentPositionData,
  ): Promise<InvestmentPosition> {
    return tx.investmentPosition.create({
      data,
    });
  }

  /**
   * Find by internal ID
   */
  async findById(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<InvestmentPosition | null> {
    return tx.investmentPosition.findUnique({
      where: { id },
    });
  }

  /**
   * Find by Seccl position ID
   */
  async findBySecclPositionId(
    tx: Prisma.TransactionClient,
    secclPositionId: string,
  ): Promise<InvestmentPosition | null> {
    return tx.investmentPosition.findUnique({
      where: { secclPositionId },
    });
  }

  /**
   * Find all positions for a user
   */
  async findByUserId(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<InvestmentPosition[]> {
    return tx.investmentPosition.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Find all positions for a Seccl account
   */
  async findBySecclAccountId(
    tx: Prisma.TransactionClient,
    secclAccountId: string,
  ): Promise<InvestmentPosition[]> {
    return tx.investmentPosition.findMany({
      where: { secclAccountId },
    });
  }

  /**
   * Update position
   */
  async update(
    tx: Prisma.TransactionClient,
    id: string,
    data: UpdateInvestmentPositionData,
  ): Promise<InvestmentPosition> {
    return tx.investmentPosition.update({
      where: { id },
      data: {
        ...data,
        lastUpdatedAt: new Date(),
      },
    });
  }

  /**
   * Upsert position (create or update)
   */
  async upsert(
    tx: Prisma.TransactionClient,
    secclPositionId: string,
    create: CreateInvestmentPositionData,
    update: UpdateInvestmentPositionData,
  ): Promise<InvestmentPosition> {
    return tx.investmentPosition.upsert({
      where: { secclPositionId },
      create,
      update: {
        ...update,
        lastUpdatedAt: new Date(),
      },
    });
  }
}
