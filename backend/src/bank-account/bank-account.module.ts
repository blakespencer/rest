import { Module } from '@nestjs/common';
import { BankAccountController } from './bank-account.controller';
import { BankAccountService } from './bank-account.service';
import { BankAccountRepository } from './bank-account.repository';
import { TransactionRepository } from '../transaction/transaction.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../common/logging/logger.module';

@Module({
  imports: [PrismaModule, LoggerModule],
  controllers: [BankAccountController],
  providers: [BankAccountService, BankAccountRepository, TransactionRepository],
  exports: [BankAccountService, BankAccountRepository],
})
export class BankAccountModule {}
