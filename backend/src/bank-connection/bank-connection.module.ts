import { Module } from '@nestjs/common';
import { BankConnectionController } from './bank-connection.controller';
import { BankConnectionService } from './bank-connection.service';
import { BankConnectionExchangeService } from './bank-connection-exchange.service';
import { BankConnectionSyncService } from './bank-connection-sync.service';
import { BankConnectionRepository } from './bank-connection.repository';
import { TransactionRepository } from '../transaction/transaction.repository';
import { PlaidModule } from '../plaid/plaid.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../common/logging/logger.module';
import { EncryptionModule } from '../common/encryption/encryption.module';

@Module({
  imports: [PrismaModule, LoggerModule, EncryptionModule, PlaidModule],
  controllers: [BankConnectionController],
  providers: [
    BankConnectionService,
    BankConnectionExchangeService,
    BankConnectionSyncService,
    BankConnectionRepository,
    TransactionRepository,
  ],
  exports: [BankConnectionService, BankConnectionRepository],
})
export class BankConnectionModule {}
