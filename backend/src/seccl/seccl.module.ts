import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SecclService } from './seccl.service';
import { LoggerModule } from '../common/logging/logger.module';

@Module({
  imports: [ConfigModule, LoggerModule],
  providers: [SecclService],
  exports: [SecclService],
})
export class SecclModule {}
