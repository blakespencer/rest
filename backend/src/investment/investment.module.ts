import { Module } from '@nestjs/common';
import { InvestmentController } from './investment.controller';
import { InvestmentService } from './investment.service';
import { InvestmentOrderExecutionService } from './investment-order-execution.service';
import { SecclAccountRepository } from './seccl-account.repository';
import { InvestmentOrderRepository } from './investment-order.repository';
import { InvestmentPositionRepository } from './investment-position.repository';
import { SecclModule } from '../seccl/seccl.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../common/logging/logger.module';

@Module({
  imports: [PrismaModule, LoggerModule, SecclModule],
  controllers: [InvestmentController],
  providers: [
    InvestmentService,
    InvestmentOrderExecutionService,
    SecclAccountRepository,
    InvestmentOrderRepository,
    InvestmentPositionRepository,
  ],
  exports: [InvestmentService],
})
export class InvestmentModule {}
