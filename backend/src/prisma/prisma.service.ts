import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LoggerService } from '../common/logging/logger.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly logger: LoggerService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.info('Database connected', { service: 'PrismaService' });

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: any) => {
        if (e.duration > 1000) {
          this.logger.warn('Slow query detected', {
            query: e.query,
            duration: e.duration,
            params: e.params,
          });
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.info('Database disconnected', { service: 'PrismaService' });
  }

  /**
   * Utility for cleaning database in tests
   */
  async cleanDatabase(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production');
    }

    // Delete in reverse order of dependencies
    await this.auditLog.deleteMany();
    await this.investmentPosition.deleteMany();
    await this.investmentOrder.deleteMany();
    await this.transaction.deleteMany();
    await this.bankAccount.deleteMany();
    await this.bankConnection.deleteMany();
    await this.user.deleteMany();

    this.logger.info('Database cleaned', { service: 'PrismaService' });
  }
}
