import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlaidService } from './plaid.service';
import { PlaidController } from './plaid.controller';
import { LoggerModule } from '../common/logging/logger.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    forwardRef(() => import('../bank-connection/bank-connection.module').then(m => m.BankConnectionModule)),
  ],
  controllers: [PlaidController],
  providers: [PlaidService],
  exports: [PlaidService],
})
export class PlaidModule {}
