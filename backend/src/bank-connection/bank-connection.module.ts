import { Module } from '@nestjs/common';
import { BankConnectionController } from './bank-connection.controller';
import { BankConnectionService } from './bank-connection.service';
import { BankConnectionRepository } from './bank-connection.repository';
import { PlaidModule } from '../plaid/plaid.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../common/logging/logger.module';
import { EncryptionModule } from '../common/encryption/encryption.module';

@Module({
  imports: [PrismaModule, LoggerModule, EncryptionModule, PlaidModule],
  controllers: [BankConnectionController],
  providers: [BankConnectionService, BankConnectionRepository],
  exports: [BankConnectionService, BankConnectionRepository],
})
export class BankConnectionModule {}
