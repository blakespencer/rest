#!/usr/bin/env node

/**
 * Environment Validation Script
 *
 * Validates that:
 * 1. .env file exists
 * 2. All required variables are present
 * 3. Security keys are properly formatted
 * 4. No placeholder values remain
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Required environment variables
const REQUIRED_VARS = {
  NODE_ENV: {
    required: true,
    allowedValues: ['development', 'production', 'test'],
    description: 'Application environment',
  },
  PORT: {
    required: true,
    type: 'number',
    description: 'Application port',
  },
  DATABASE_URL: {
    required: true,
    pattern: /^postgresql:\/\/.+/,
    description: 'PostgreSQL connection string',
  },
  ENCRYPTION_KEY: {
    required: true,
    pattern: /^[a-fA-F0-9]{64}$/,
    description: '32-byte encryption key (64 hex characters)',
    placeholder: 'your_32_byte_encryption_key_here',
  },
  JWT_SECRET: {
    required: true,
    minLength: 32,
    description: 'JWT signing secret',
    placeholder: 'your_jwt_secret_here',
  },
  PLAID_CLIENT_ID: {
    required: true,
    description: 'Plaid client ID',
    placeholder: 'your_plaid_client_id',
  },
  PLAID_SECRET: {
    required: true,
    description: 'Plaid sandbox secret',
    placeholder: 'your_plaid_sandbox_secret',
  },
  PLAID_ENV: {
    required: true,
    allowedValues: ['sandbox', 'development', 'production'],
    description: 'Plaid environment',
  },
};

// Optional but recommended variables
const RECOMMENDED_VARS = {
  JWT_EXPIRATION: {
    description: 'JWT token expiration time',
  },
  LOG_LEVEL: {
    allowedValues: ['error', 'warn', 'info', 'debug', 'verbose'],
    description: 'Logging level',
  },
  LOG_FORMAT: {
    allowedValues: ['json', 'pretty'],
    description: 'Log format',
  },
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function readEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = {};

    content.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || !line.trim()) return;

      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        env[key] = value;
      }
    });

    return env;
  } catch (error) {
    return null;
  }
}

function validateVariable(name, value, config) {
  const errors = [];
  const warnings = [];

  // Check if value is a placeholder
  if (config.placeholder && value.toLowerCase().includes(config.placeholder.toLowerCase())) {
    errors.push(`"${name}" contains placeholder value. Replace with actual value.`);
  }

  // Check allowed values
  if (config.allowedValues && !config.allowedValues.includes(value)) {
    errors.push(
      `"${name}" must be one of: ${config.allowedValues.join(', ')}. Got: "${value}"`
    );
  }

  // Check pattern
  if (config.pattern && !config.pattern.test(value)) {
    errors.push(`"${name}" does not match required format: ${config.description}`);
  }

  // Check type
  if (config.type === 'number' && isNaN(Number(value))) {
    errors.push(`"${name}" must be a number. Got: "${value}"`);
  }

  // Check minimum length
  if (config.minLength && value.length < config.minLength) {
    warnings.push(
      `"${name}" is shorter than recommended (${config.minLength} characters). Current: ${value.length}`
    );
  }

  return { errors, warnings };
}

function validateEnv() {
  log('\n🔍 Validating environment configuration...\n', 'cyan');

  // Check if .env exists
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    log('❌ Error: .env file not found', 'red');
    log('   Run: cp .env.example .env', 'yellow');
    process.exit(1);
  }

  log('✓ .env file exists', 'green');

  // Read .env file
  const env = readEnvFile(envPath);
  if (!env) {
    log('❌ Error: Could not read .env file', 'red');
    process.exit(1);
  }

  let hasErrors = false;
  let hasWarnings = false;
  const errors = [];
  const warnings = [];

  // Validate required variables
  log('\n📋 Checking required variables:\n', 'blue');

  Object.entries(REQUIRED_VARS).forEach(([name, config]) => {
    const value = env[name];

    if (!value) {
      errors.push(`Missing required variable: ${name} (${config.description})`);
      log(`  ❌ ${name}: Missing`, 'red');
      hasErrors = true;
    } else {
      const { errors: varErrors, warnings: varWarnings } = validateVariable(
        name,
        value,
        config
      );

      if (varErrors.length > 0) {
        varErrors.forEach(err => errors.push(err));
        log(`  ❌ ${name}: ${varErrors[0]}`, 'red');
        hasErrors = true;
      } else if (varWarnings.length > 0) {
        varWarnings.forEach(warn => warnings.push(warn));
        log(`  ⚠️  ${name}: ${varWarnings[0]}`, 'yellow');
        hasWarnings = true;
      } else {
        log(`  ✓ ${name}`, 'green');
      }
    }
  });

  // Check recommended variables
  log('\n📋 Checking recommended variables:\n', 'blue');

  Object.entries(RECOMMENDED_VARS).forEach(([name, config]) => {
    const value = env[name];

    if (!value) {
      log(`  ⚠️  ${name}: Not set (${config.description})`, 'yellow');
      hasWarnings = true;
    } else {
      const { errors: varErrors, warnings: varWarnings } = validateVariable(
        name,
        value,
        config
      );

      if (varErrors.length > 0) {
        varErrors.forEach(err => warnings.push(err));
        log(`  ⚠️  ${name}: ${varErrors[0]}`, 'yellow');
        hasWarnings = true;
      } else {
        log(`  ✓ ${name}`, 'green');
      }
    }
  });

  // Summary
  log('\n' + '='.repeat(60), 'cyan');

  if (hasErrors) {
    log('\n❌ Validation failed with errors:\n', 'red');
    errors.forEach(err => log(`   • ${err}`, 'red'));
    log('', 'reset');
    process.exit(1);
  }

  if (hasWarnings) {
    log('\n⚠️  Validation passed with warnings:\n', 'yellow');
    warnings.forEach(warn => log(`   • ${warn}`, 'yellow'));
    log('\n✓ Environment is valid but could be improved\n', 'yellow');
  } else {
    log('\n✅ All validations passed! Environment is correctly configured.\n', 'green');
  }

  process.exit(0);
}

// Run validation
validateEnv();
