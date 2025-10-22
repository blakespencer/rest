import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/env.validation';
import { LoggerModule } from './common/logging/logger.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PlaidModule } from './plaid/plaid.module';
import { BankConnectionModule } from './bank-connection/bank-connection.module';
import { BankAccountModule } from './bank-account/bank-account.module';
import { InvestmentModule } from './investment/investment.module';
import { SecclModule } from './seccl/seccl.module';

@Module({
  imports: [
    // Environment configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: '.env',
    }),
    // Global modules
    LoggerModule,
    EncryptionModule,
    PrismaModule,
    // Feature modules
    HealthModule,
    AuthModule,
    PlaidModule,
    BankConnectionModule,
    BankAccountModule,
    SecclModule,
    InvestmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
