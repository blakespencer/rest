import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlaidService } from './plaid.service';
import { LoggerModule } from '../common/logging/logger.module';

@Module({
  imports: [ConfigModule, LoggerModule],
  providers: [PlaidService],
  exports: [PlaidService],
})
export class PlaidModule {}
