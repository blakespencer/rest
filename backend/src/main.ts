import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LoggerService } from './common/logging/logger.service';
import { AllExceptionsFilter } from './common/exceptions/all-exceptions.filter';
import { createOpenApiDocument } from './config/openapi.config';
import { apiReference } from '@scalar/nestjs-api-reference';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Get logger instance
  const logger = app.get(LoggerService);
  logger.setContext('Bootstrap');

  // Set custom logger
  app.useLogger(logger);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // CORS configuration
  const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // OpenAPI documentation setup (DRY - single config for both UIs)
  const openApiDocument = createOpenApiDocument(app);

  // Swagger UI (traditional - for compatibility)
  SwaggerModule.setup('api', app, openApiDocument);

  // Scalar (modern - beautiful UI for demos and development)
  app.use(
    '/reference',
    apiReference({
      content: openApiDocument,
      theme: 'purple',
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.info(`Application started`, {
    port,
    environment: process.env.NODE_ENV,
    corsOrigins,
    docs: {
      swagger: `http://localhost:${port}/api`,
      scalar: `http://localhost:${port}/reference`,
    },
  });
}

bootstrap().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  process.stderr.write(
    `[FATAL] Failed to start application: ${errorMessage}\n${stack}\n`,
  );
  process.exit(1);
});
