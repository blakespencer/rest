# Rest Treasury Service

A production-ready treasury management system prototype that connects business bank accounts via Plaid, fetches consolidated balances and transactions, and simulates investment flows into money market funds.

## Overview

This service demonstrates end-to-end financial data connectivity with institutional-grade security patterns, including:
- Multi-bank account connectivity via Plaid (Sandbox)
- Consolidated balance and transaction views
- Investment order simulation via Seccl API (or mock service)
- Field-level encryption for sensitive data
- Idempotent financial operations
- Comprehensive audit logging

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend Framework** | NestJS + TypeScript |
| **Database** | PostgreSQL + Prisma ORM |
| **Bank Connectivity** | Plaid API (Sandbox) |
| **Investment Platform** | Seccl API (Sandbox) / Mock Service |
| **Authentication** | JWT |
| **Security** | AES-256 field-level encryption |
| **Testing** | Jest (Unit + Integration + E2E) |
| **Infrastructure** | Docker Compose |

## Architecture

### High-Level Data Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP/JWT
       ↓
┌─────────────────────────────────────────────────────────────┐
│ Controller Layer (HTTP)                                      │
│ • Input validation (DTOs)                                    │
│ • Response formatting                                        │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│ Service Layer (Business Logic)                              │
│ • Transaction orchestration                                 │
│ • External API coordination                                 │
│ • Domain logic & transformations                            │
└─────────────────────────────────────────────────────────────┘
       ↓                                ↓
┌──────────────────┐         ┌──────────────────────┐
│ Repository Layer │         │ External Services    │
│ • Prisma queries │         │ • PlaidService       │
│ • DB operations  │         │ • SecclService       │
└──────────────────┘         └──────────────────────┘
       ↓                                ↓
┌──────────────────┐         ┌──────────────────────┐
│   PostgreSQL     │         │   Plaid API          │
│                  │         │   Seccl API          │
└──────────────────┘         └──────────────────────┘
```

### Key Architectural Patterns

**1. Service Layer Owns Transactions**
- All multi-step database operations wrapped in Prisma transactions
- Ensures atomicity for financial operations

**2. Repository Layer is Database-Only**
- Pure data access via Prisma
- No business logic or external API calls
- Accepts `Prisma.TransactionClient` for transaction support

**3. External Service Layer**
- Dedicated services (PlaidService, SecclService) for API communication
- Built-in retry logic with exponential backoff
- Response mapping to internal domain models

**4. Idempotency for Financial Operations**
- All financial mutations require `Idempotency-Key` header
- Duplicate requests return existing result (no side effects)
- Prevents accidental double-charges/double-orders

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Plaid API credentials (free sandbox account)

### Setup

1. **Clone and install dependencies**
```bash
cd backend
npm install
```

2. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your Plaid credentials
```

Required variables:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/rest_treasury"
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
ENCRYPTION_KEY=32_byte_key_for_aes_256
JWT_SECRET=your_jwt_secret
```

3. **Start infrastructure**
```bash
docker compose up -d postgres
```

4. **Run database migrations**
```bash
npx prisma migrate dev
```

5. **Start development server**
```bash
npm run start:dev
```

API will be available at `http://localhost:3000`

## API Endpoints

### Authentication
```http
POST /api/auth/register
POST /api/auth/login
```

### Plaid Link Flow
```http
POST /api/plaid/link-token
POST /api/plaid/exchange-token
```

### Bank Connections
```http
GET    /api/bank-connections
GET    /api/bank-connections/:id
POST   /api/bank-connections/:id/sync
DELETE /api/bank-connections/:id
```

### Bank Accounts
```http
GET /api/bank-accounts
GET /api/bank-accounts/:id/transactions
GET /api/bank-accounts/consolidated-balance
```

### Investments
```http
POST   /api/investments/orders
GET    /api/investments/orders
GET    /api/investments/orders/:id
GET    /api/investments/positions
```

**Note:** All financial endpoints require `Idempotency-Key` header.

## Example Flow

```bash
# 1. Create a link token
curl -X POST http://localhost:3000/api/plaid/link-token \
  -H "Authorization: Bearer $JWT_TOKEN"

# 2. Exchange public token (from Plaid Link UI)
curl -X POST http://localhost:3000/api/plaid/exchange-token \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"publicToken": "public-sandbox-xxx"}'

# 3. Get consolidated balances
curl http://localhost:3000/api/bank-accounts/consolidated-balance \
  -H "Authorization: Bearer $JWT_TOKEN"

# 4. Place investment order
curl -X POST http://localhost:3000/api/investments/orders \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "fundId": "mmf-001",
    "sourceAccountId": "acc-xxx"
  }'
```

## Testing

### Three-Tier Testing Strategy

**1. Unit Tests** (Fast, isolated)
```bash
npm run test
```
- Mock external dependencies (Plaid, Seccl, database)
- Test business logic in isolation
- Located: `src/**/__tests__/*.unit.test.ts`

**2. Integration Tests** (Database operations)
```bash
npm run test:integration
```
- Real PostgreSQL database
- Test repository layer and Prisma queries
- Verify transaction orchestration
- Located: `tests/integration/*.int.test.ts`

**3. E2E Tests** (Full HTTP flows)
```bash
npm run test:e2e
```
- Complete NestJS application + PostgreSQL
- Mock external APIs (Plaid, Seccl)
- Test real HTTP requests
- Located: `tests/e2e/*.e2e.test.ts`

### Test Coverage
```bash
npm run test:cov
```

Target: 80%+ coverage for critical paths (financial operations, security)

## Production Hardening

### Security Measures

| Risk | Mitigation |
|------|------------|
| **Sensitive data exposure** | AES-256 field-level encryption for access tokens, account numbers |
| **Token theft** | JWT with short expiration, refresh token rotation |
| **API abuse** | Rate limiting (10 req/min for financial endpoints) |
| **MITM attacks** | TLS 1.3+ only, HSTS headers |
| **Webhook tampering** | Signature verification for Plaid/Seccl webhooks |
| **SQL injection** | Prisma ORM (parameterized queries) |
| **XSS/CSRF** | Helmet.js middleware, CORS configuration |

### Reliability Patterns

**1. Idempotency**
- All financial mutations require `Idempotency-Key`
- Stored in database with 24-hour TTL
- Prevents duplicate transactions on retry

**2. Retry Logic**
- External API calls: 3 retries with exponential backoff
- Transient errors (network, timeout): automatic retry
- Permanent errors (400, 401): immediate failure

**3. Transaction Management**
- Multi-step operations wrapped in database transactions
- Atomic commit/rollback
- Saga pattern for distributed transactions (future)

**4. Audit Logging**
- Every financial mutation logged with:
  - User ID, timestamp, IP address
  - Before/after state
  - Idempotency key
  - External API references
- Immutable audit log (append-only)

**5. Reconciliation**
- Daily batch job to reconcile internal state with Plaid/Seccl
- Alert on discrepancies
- Manual review for unmatched transactions

**6. Observability**
- Structured logging (JSON format)
- Metrics: request latency, error rates, external API latency
- Distributed tracing for multi-service calls
- Health check endpoints (`/health`, `/ready`)

### Deployment Considerations

**Infrastructure**
- Containerized deployment (Docker)
- Kubernetes for orchestration (horizontal scaling)
- PostgreSQL with read replicas
- Redis for caching and job queues

**Data Protection**
- Database encryption at rest
- Automated backups (hourly incremental, daily full)
- Point-in-time recovery (7-day retention)
- Geographic redundancy

**Compliance**
- PCI DSS for payment card data (if applicable)
- SOC 2 Type II controls
- GDPR compliance (data retention, right to deletion)
- Regular security audits and penetration testing

**Monitoring & Alerting**
- Error rate > 1%: page on-call
- External API latency > 5s: warning
- Database connection pool exhausted: critical
- Failed reconciliation: manual review required

## Project Structure

```
rest/
├── backend/
│   ├── src/
│   │   ├── auth/                 # JWT authentication
│   │   ├── plaid/                # Plaid API integration
│   │   ├── bank-connection/      # Bank connection management
│   │   ├── bank-account/         # Account data & sync
│   │   ├── investment/           # Investment orders (Seccl)
│   │   ├── common/               # Shared utilities
│   │   │   ├── base/             # BaseService, BaseRepository
│   │   │   ├── encryption/       # AES-256 encryption
│   │   │   ├── logging/          # Structured logger
│   │   │   └── exceptions/       # Custom exceptions
│   │   └── prisma/
│   │       └── schema.prisma
│   │
│   ├── tests/
│   │   ├── integration/          # Database integration tests
│   │   └── e2e/                  # End-to-end HTTP tests
│   │
│   ├── prisma/
│   │   ├── migrations/
│   │   └── seed.ts
│   │
│   └── docker-compose.yml
│
├── ASSIGNMENT.md                 # Original requirements
├── CLAUDE.md                     # AI assistant context
└── README.md                     # This file
```

## Development Guidelines

See [CLAUDE.md](./CLAUDE.md) for:
- Detailed architecture patterns
- Code examples and anti-patterns
- Testing best practices
- Security implementation guide

## License

Proprietary - Rest Treasury Service

---

**Built with production-grade patterns for financial services**
