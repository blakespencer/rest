import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * DRY OpenAPI Configuration
 * Single source of truth for API documentation metadata
 * Used by both Swagger UI and Scalar
 */
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Rest Treasury API')
    .setDescription(
      'Production-ready treasury management system with bank connectivity via Plaid and investment flows via Seccl',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
        name: 'Authorization',
        in: 'header',
      },
      'JWT',
    )
    .addTag('Auth', 'Authentication and user management')
    .addTag('Plaid', 'Plaid Link and bank connectivity')
    .addTag('Bank Connections', 'Bank connection management')
    .addTag('Bank Accounts', 'Bank account and transaction data')
    .addTag('Investments', 'Investment accounts and orders')
    .addServer('http://localhost:3000', 'Local development')
    .build();

  return SwaggerModule.createDocument(app, config);
}
