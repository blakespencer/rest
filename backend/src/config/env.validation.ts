import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

enum PlaidEnvironment {
  Sandbox = 'sandbox',
  Development = 'development',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  // Database
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  // Security
  @IsString()
  @IsNotEmpty()
  ENCRYPTION_KEY: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRATION?: string;

  // Plaid
  @IsString()
  @IsNotEmpty()
  PLAID_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  PLAID_SECRET: string;

  @IsEnum(PlaidEnvironment)
  PLAID_ENV: PlaidEnvironment;

  @IsString()
  @IsOptional()
  PLAID_VERSION?: string;

  @IsString()
  @IsOptional()
  PLAID_PRODUCTS?: string;

  @IsString()
  @IsOptional()
  PLAID_COUNTRY_CODES?: string;

  // Seccl (optional - mock by default)
  @IsString()
  @IsOptional()
  USE_MOCK_SECCL?: string;

  @IsString()
  @IsOptional()
  SECCL_API_KEY?: string;

  @IsString()
  @IsOptional()
  SECCL_BASE_URL?: string;

  // Logging
  @IsString()
  @IsOptional()
  LOG_LEVEL?: string;

  @IsString()
  @IsOptional()
  LOG_FORMAT?: string;

  // CORS
  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = error.constraints
          ? Object.values(error.constraints)
          : [];
        return `${error.property}: ${constraints.join(', ')}`;
      })
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return validatedConfig;
}
