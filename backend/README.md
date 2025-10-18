# Rest Treasury Service - Backend

NestJS backend for the Rest Treasury Service, providing secure bank connectivity and investment management.

## Quick Start

**Get started in 5 minutes:**

See [docs/QUICKSTART.md](./docs/QUICKSTART.md) for rapid setup.

## Documentation

- **[Quick Start Guide](./docs/QUICKSTART.md)** - Get running in 5 minutes
- **[Complete Setup Guide](./docs/SETUP.md)** - Detailed environment configuration and Plaid setup
- **[Project README](../README.md)** - Architecture and production hardening

## Prerequisites

- Node.js 18+
- Docker Desktop
- Plaid account (free sandbox)

## Installation

```bash
npm install
```

## Environment Setup

1. Copy environment template:
```bash
cp .env.example .env
```

2. Generate security keys:
```bash
openssl rand -hex 32    # ENCRYPTION_KEY
openssl rand -base64 32 # JWT_SECRET
```

3. Add your Plaid credentials to `.env`:
   - Get credentials from: https://dashboard.plaid.com/team/keys
   - Use **sandbox** secret

4. Start PostgreSQL:
```bash
docker compose up -d postgres
```

5. Run migrations:
```bash
npx prisma migrate dev
```

## Development

```bash
# Start in watch mode
npm run start:dev

# Run linter
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Project Structure

```
backend/
├── src/
│   ├── auth/              # JWT authentication
│   ├── plaid/             # Plaid API integration
│   ├── bank-connection/   # Bank connections
│   ├── bank-account/      # Account & transaction sync
│   ├── investment/        # Investment orders
│   ├── common/            # Shared utilities
│   │   ├── base/          # BaseService, BaseRepository
│   │   ├── encryption/    # AES-256 encryption
│   │   ├── logging/       # Structured logger
│   │   └── exceptions/    # Custom exceptions
│   └── prisma/
│       └── schema.prisma
│
├── tests/
│   ├── integration/       # Database integration tests
│   └── e2e/               # End-to-end API tests
│
├── prisma/
│   ├── migrations/
│   └── seed.ts
│
├── docs/
│   ├── QUICKSTART.md      # 5-minute setup
│   └── SETUP.md           # Detailed setup guide
│
└── .env.example           # Environment template
```

## Architecture Patterns

This backend follows strict architectural patterns for financial services:

- **Three-Layer Architecture**: Controller → Service → Repository
- **Service Layer Owns Transactions**: All DB transactions managed in services
- **Repository Layer is Database-Only**: No business logic or API calls
- **Idempotency for Financial Operations**: All financial mutations require idempotency keys
- **Field-Level Encryption**: Sensitive data encrypted at rest
- **Comprehensive Audit Logging**: All financial operations logged

See [CLAUDE.md](../CLAUDE.md) for detailed architecture documentation.

## API Endpoints

Once running, the API is available at `http://localhost:3000`:

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/plaid/link-token` - Create Plaid Link token
- `POST /api/plaid/exchange-token` - Exchange public token
- `GET /api/bank-accounts` - List bank accounts
- `GET /api/bank-accounts/consolidated-balance` - Get total balance
- `POST /api/investments/orders` - Place investment order

## Troubleshooting

**Database connection errors:**
```bash
docker compose ps
docker compose restart postgres
```

**Plaid API errors:**
- Verify you're using the **sandbox** secret
- Check `PLAID_ENV=sandbox` in `.env`

**Environment validation errors:**
- Compare `.env` with `.env.example`
- Ensure all required variables are set

## Support

For detailed help:
- Check [docs/SETUP.md](./docs/SETUP.md) for troubleshooting
- Review Plaid documentation: https://plaid.com/docs/
- Check NestJS documentation: https://docs.nestjs.com

## License

Proprietary - Rest Treasury Service
