import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

export interface LogContext {
  [key: string]: any;
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, context?: LogContext): void {
    this.print('info', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.print('info', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.print('error', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.print('warn', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.print('debug', message, context);
  }

  verbose(message: string, context?: LogContext): void {
    this.print('verbose', message, context);
  }

  private print(level: string, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logContext = this.context || 'Application';

    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      context: logContext,
      message,
      ...(context && { ...context }),
    };

    // For development: pretty print
    if (process.env.LOG_FORMAT === 'pretty') {
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';
      console.log(
        `[${timestamp}] [${level.toUpperCase()}] [${logContext}] ${message}${contextStr}`,
      );
    } else {
      // For production: JSON format for log aggregation
      console.log(JSON.stringify(logEntry));
    }
  }
}
