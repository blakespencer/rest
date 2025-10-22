# Rest Treasury Service - Architecture Decision Record

## Overview

This document captures the key architectural decisions made during the development of the Rest Treasury Service prototype. It serves as a reference for understanding the technical choices, trade-offs, and rationale behind the system design.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Layer Architecture](#layer-architecture)
3. [Data Storage Strategy](#data-storage-strategy)
4. [Security Architecture](#security-architecture)
5. [External Integration Patterns](#external-integration-patterns)
6. [API Design](#api-design)
7. [Testing Strategy](#testing-strategy)
8. [Error Handling](#error-handling)
9. [Code Quality Standards](#code-quality-standards)
10. [Technology Stack](#technology-stack)

---

## 1. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  (Postman, cURL, Frontend - not yet implemented)            │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                     NestJS Backend API                       │
│  • JWT Authentication                                        │
│  • OpenAPI Documentation (Swagger + Scalar)                  │
│  • Global Validation & Exception Handling                    │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
┌──────────────────┬──────────────────┬──────────────────────┐
│   Plaid API      │  PostgreSQL DB   │  Mock Seccl Service  │
│   (External)     │  (Persistent)    │  (In-Memory)         │
└──────────────────┴──────────────────┴──────────────────────┘
```

### Decision: Monolithic NestJS Application

**Chosen:** Single NestJS application with modular structure

**Rationale:**
- **Prototype Context**: This is a 2-hour prototype demonstrating financial connectivity patterns
- **Simplicity**: Easier to develop, test, and deploy as a single unit
- **Performance**: No network latency between services for prototype
- **Development Speed**: Faster iteration with shared code and dependencies

**Trade-offs:**
- ❌ Less scalable than microservices (acceptable for prototype)
- ❌ Tighter coupling between modules (mitigated by clear boundaries)
- ✅ Simpler deployment and debugging
- ✅ Easier transaction management across domain boundaries

**Future Consideration:**
For production at scale, consider extracting:
- **Investment Service** → Separate microservice
- **Bank Connectivity Service** → Separate microservice
- **Notification Service** → Background job processor

---

## 2. Layer Architecture

### Three-Layer Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│ CONTROLLER LAYER                                             │
│ • HTTP request/response handling                            │
│ • Input validation (class-validator)                        │
│ • DTOs: Request → Response                                  │
│ • Authentication guards (JWT)                               │
│ • OpenAPI decorators                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
              Response DTOs only
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SERVICE LAYER                                                │
│ • Business logic orchestration                              │
│ • Transaction management (owns all DB transactions)         │
│ • External API coordination                                 │
│ • Domain model transformation (via mappers)                 │
│ • Error handling and logging                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
              Domain models (Prisma types)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ REPOSITORY LAYER                                             │
│ • Pure database operations (Prisma ORM)                     │
│ • NO business logic                                         │
│ • NO external API calls                                     │
│ • Accepts Prisma.TransactionClient for atomic operations    │
│ • Returns Prisma-generated types                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ DATABASE (PostgreSQL)                                        │
└─────────────────────────────────────────────────────────────┘
```

### Decision: Service Layer Owns Transactions

**Chosen:** All database transactions are initiated and managed in the service layer

**Rationale:**
- **Business Logic Context**: Services understand the complete business operation
- **Multiple Repository Coordination**: One transaction can span multiple repositories
- **External API Integration**: Services coordinate between database and external APIs
- **Rollback Control**: Services decide when to rollback based on business rules

**Example:**
```typescript
// ✅ CORRECT - Service owns transaction
async createInvestmentOrder(userId: string, dto: CreateOrderDto, idempotencyKey: string) {
  return this.executeInTransaction(async (tx) => {
    // 1. Check idempotency
    const existing = await this.orderRepo.findByIdempotencyKey(tx, idempotencyKey);
    if (existing) return this.mapToDto(existing);

    // 2. Create order
    const order = await this.orderRepo.create(tx, { ...dto, userId });

    // 3. Call external API
    const secclResponse = await this.secclService.createTransactionGroup(...);

    // 4. Update order with external reference
    await this.orderRepo.update(tx, order.id, {
      externalOrderId: secclResponse.id
    });

    // 5. Log audit trail
    await this.auditRepo.log(tx, { action: 'ORDER_CREATED', ... });

    return this.mapToDto(order);
  });
}
```

**Trade-offs:**
- ✅ Clear responsibility: Services orchestrate, Repositories execute
- ✅ Easier to test: Mock repositories, test service logic
- ✅ Atomic operations across multiple tables
- ❌ Services become coordination layer (acceptable - that's their purpose)

### Decision: Repository Layer is Database-Only

**Chosen:** Repositories only interact with the database via Prisma, no business logic or external APIs

**Rationale:**
- **Single Responsibility**: Repositories focus solely on data persistence
- **Testability**: Easy to test database operations in isolation
- **Reusability**: Repositories can be reused across multiple services
- **Clear Boundaries**: No confusion about where logic belongs

**Example:**
```typescript
// ✅ CORRECT - Pure database operation
export class BankConnectionRepository extends BaseRepository {
  async findByUserId(
    tx: Prisma.TransactionClient,
    userId: string
  ): Promise<BankConnection[]> {
    return tx.bankConnection.findMany({
      where: { userId, deletedAt: null },
      include: { accounts: true },
    });
  }
}

// ❌ WRONG - Repository making API calls
async syncAccounts(tx: Prisma.TransactionClient, connectionId: string) {
  const connection = await tx.bankConnection.findUnique({ where: { id: connectionId } });
  const accounts = await this.plaidApi.getAccounts(connection.accessToken); // NO!
  return tx.account.createMany({ data: accounts });
}
```

**Trade-offs:**
- ✅ Clear separation of concerns
- ✅ Easy to understand and maintain
- ✅ Reusable across services
- ❌ Requires explicit coordination in service layer (acceptable - better clarity)

---

## 3. Data Storage Strategy

### Decision: Hybrid Storage Model

**Chosen:** PostgreSQL for persistent data + In-memory storage for mock Seccl

```
┌──────────────────────────────────────────────────────────────┐
│ PERSISTENT DATA (PostgreSQL via Prisma)                      │
├──────────────────────────────────────────────────────────────┤
│ • Users (authentication data, encrypted passwords)           │
│ • Bank Connections (encrypted Plaid access tokens)           │
│ • Bank Accounts (account metadata, balances)                 │
│ • Bank Transactions (transaction history)                    │
│ • Seccl Investment Accounts (our internal records)           │
│ • Investment Orders (order history, status)                  │
│ • Investment Positions (share holdings)                      │
│ • Transactions (payment/order transaction records)           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ IN-MEMORY DATA (Mock Seccl Service)                          │
├──────────────────────────────────────────────────────────────┤
│ • Seccl Account Details (simulated API responses)            │
│ • Seccl Transaction Groups (payment + order pairs)           │
│ • Seccl Positions (fund holdings, book values)               │
│ • Seccl Account Summary (aggregated portfolio data)          │
│                                                               │
│ Implementation: JavaScript Map objects                       │
│ Persistence: Lost on server restart (acceptable for mock)   │
└──────────────────────────────────────────────────────────────┘
```

### Rationale for Hybrid Approach

**PostgreSQL for Core Data:**
- **Persistence**: User data, bank connections, and investment records must survive restarts
- **ACID Compliance**: Financial operations require atomic, consistent, isolated, durable transactions
- **Audit Trail**: Permanent record of all financial mutations
- **Production Ready**: Same database would be used in production

**In-Memory for Mock Seccl:**
- **Prototype Context**: Seccl integration is simulated for 2-hour prototype
- **No External Dependency**: No need for Seccl sandbox credentials
- **Fast Iteration**: Instant responses without network calls
- **Easy Testing**: Predictable state for testing

### Data Flow Example: Investment Order

```
1. User submits investment order
   ↓
2. Controller validates request DTO
   ↓
3. Service starts database transaction
   ↓
4. OrderRepository.create() → PostgreSQL
   ├─ Investment order record created
   └─ Status: PENDING
   ↓
5. SecclService.createTransactionGroup() → In-Memory Map
   ├─ Mock payment transaction (PENDING)
   ├─ Mock order transaction (PENDING)
   └─ Returns transaction group ID
   ↓
6. OrderRepository.update() → PostgreSQL
   ├─ Add externalOrderId (Seccl transaction group ID)
   └─ Status: SUBMITTED
   ↓
7. SecclService.completeTransaction(payment) → In-Memory Map
   ├─ Update payment status: COMPLETE
   └─ Simulate instant settlement (in production: 1-3 days)
   ↓
8. SecclService.completeTransaction(order) → In-Memory Map
   ├─ Calculate shares: £98 / £2.27 = 43 shares
   ├─ Update order status: ORDER_COMPLETED
   └─ Create/update position in Map
   ↓
9. PositionRepository.upsert() → PostgreSQL
   ├─ Store position record for audit
   └─ Our internal copy of holdings
   ↓
10. Service commits transaction
    ↓
11. Controller returns response DTO
```

### Decision: Prisma ORM

**Chosen:** Prisma as the database toolkit

**Rationale:**
- **Type Safety**: Auto-generated TypeScript types from schema
- **Developer Experience**: Intuitive API, excellent autocomplete
- **Migrations**: Built-in migration system
- **Transaction Support**: Native support for complex transactions
- **Performance**: Efficient query generation

**Example Schema:**
```prisma
model InvestmentOrder {
  id                String   @id @default(uuid())
  userId            String
  secclAccountId    String
  fundId            String   @default("275F1")
  amount            Int      // In pence (£100 = 10000)
  currency          String   @default("GBP")
  status            String   // PENDING, SUBMITTED, COMPLETED, FAILED
  idempotencyKey    String   @unique
  externalOrderId   String?  // Seccl transaction group ID
  executedQuantity  Int?     // Number of shares purchased
  executionPrice    Int?     // Price per share in pence
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user              User     @relation(fields: [userId], references: [id])
  secclAccount      SecclAccount @relation(fields: [secclAccountId], references: [id])
}
```

**Trade-offs:**
- ✅ Type-safe database access
- ✅ Easy schema evolution with migrations
- ✅ Excellent TypeScript integration
- ❌ Abstraction layer (adds slight overhead - negligible for our scale)
- ❌ Learning curve for raw SQL experts (minimal - Prisma is intuitive)

---

## 4. Security Architecture

### Field-Level Encryption for Sensitive Data

**Decision:** Encrypt sensitive data at rest using AES-256-CBC

**Encrypted Fields:**
- Plaid access tokens (bank connection credentials)
- Bank account numbers (PII)
- Any future sensitive financial data

**Implementation:**
```typescript
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const encryptionKey = config.get('ENCRYPTION_KEY'); // 32-byte hex key
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data (separated by colon)
    return `${iv.toString('hex')}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, encrypted] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

**Rationale:**
- **Defense in Depth**: Even if database is compromised, sensitive data remains protected
- **Compliance**: Required for PCI DSS, PSD2, GDPR compliance
- **Key Rotation**: Encryption key stored in environment variables, rotatable without code changes

**Trade-offs:**
- ✅ Strong protection for sensitive data
- ✅ Industry-standard AES-256-CBC algorithm
- ❌ Slight performance overhead (encrypt/decrypt operations)
- ❌ Cannot query encrypted fields directly (acceptable - use indexed IDs)

### JWT Authentication

**Decision:** JWT Bearer tokens for stateless authentication

**Implementation:**
```typescript
// Token payload
{
  sub: userId,        // Subject (user ID)
  email: user.email,
  iat: issuedAt,      // Issued at timestamp
  exp: expiration     // Expiration timestamp (1 day)
}

// Header requirement
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Rationale:**
- **Stateless**: No session storage required, scales horizontally
- **Standard**: Industry-standard authentication mechanism
- **Secure**: Signed with secret key, tamper-proof
- **Flexible**: Easy to add roles/permissions in payload

**Security Measures:**
- ✅ Strong secret key (32+ bytes, stored in environment variables)
- ✅ Short expiration (1 day default)
- ✅ HTTPS-only in production
- ✅ Password hashing with bcrypt (10 rounds)

**Trade-offs:**
- ✅ No database lookup for every request
- ✅ Scales easily across multiple servers
- ❌ Cannot invalidate tokens before expiration (acceptable - use short TTL)
- ❌ Larger than session IDs (acceptable - gzip helps)

### Idempotency Protection

**Decision:** Require idempotency keys for all financial mutations

**Implementation:**
```typescript
// Controller validation
@Post('orders')
async createOrder(
  @Body() dto: CreateOrderDto,
  @Headers('idempotency-key') idempotencyKey?: string,
) {
  if (!idempotencyKey) {
    throw new BadRequestException('Idempotency-Key header is required');
  }
  return this.investmentService.createInvestmentOrder(user.id, dto, idempotencyKey);
}

// Service deduplication
async createInvestmentOrder(userId: string, dto: CreateOrderDto, idempotencyKey: string) {
  return this.executeInTransaction(async (tx) => {
    // Check for existing order with same key
    const existing = await this.orderRepo.findByIdempotencyKey(tx, idempotencyKey);
    if (existing) {
      this.logger.info('Returning existing order (idempotent)', { idempotencyKey });
      return this.mapToDto(existing);
    }

    // Create new order...
  });
}
```

**Rationale:**
- **Prevents Duplicates**: Network retries don't create duplicate orders
- **Financial Safety**: Critical for monetary transactions
- **Industry Standard**: Required by payment processors (Stripe, Square, etc.)

**Trade-offs:**
- ✅ Guaranteed exactly-once semantics for financial operations
- ✅ Safe to retry failed requests
- ❌ Clients must generate UUIDs (acceptable - standard practice)
- ❌ Additional database lookup (acceptable - indexed column)

---

## 5. External Integration Patterns

### Plaid Integration (Real API)

**Decision:** Direct integration with Plaid Sandbox API

**Architecture:**
```
┌────────────────────────────────────────────────────────────┐
│ PlaidService (Dedicated External Service)                  │
│ • Wraps Plaid API client                                  │
│ • Retry logic with exponential backoff                    │
│ • Structured error handling                                │
│ • Request/response logging (sanitized)                     │
└────────────────────────────────────────────────────────────┘
                          ↓ ↑
┌────────────────────────────────────────────────────────────┐
│ Plaid Sandbox API (External - plaid.com)                  │
│ • Link token creation                                      │
│ • Public token exchange                                    │
│ • Account balance fetching                                 │
│ • Transaction history (future)                             │
└────────────────────────────────────────────────────────────┘
```

**Key Patterns:**

1. **Retry Logic:**
```typescript
async exchangePublicToken(publicToken: string) {
  return retry(
    async () => {
      const response = await this.client.itemPublicTokenExchange({
        public_token: publicToken
      });
      return response.data;
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      onRetry: (error, attempt) => {
        this.logger.warn('Retrying Plaid token exchange', { attempt, error: error.message });
      },
    }
  );
}
```

2. **Structured Error Handling:**
```typescript
try {
  const response = await this.client.linkTokenCreate(request);
  return response.data;
} catch (error) {
  this.logger.error('Failed to create Plaid link token', {
    userId,
    error: error.message,
    errorCode: error.response?.data?.error_code,
  });
  throw new PlaidIntegrationException('Link token creation failed', error);
}
```

**Rationale:**
- **Real Integration**: Demonstrates actual bank connectivity
- **Production Pattern**: Same patterns would be used in production
- **Error Resilience**: Handles transient network failures gracefully

**Trade-offs:**
- ✅ Real bank connectivity demonstration
- ✅ Production-ready integration patterns
- ❌ Requires Plaid sandbox credentials
- ❌ Network dependency (acceptable - core feature)

### Seccl Integration (Mock Service)

**Decision:** In-memory mock implementation for prototype

**Architecture:**
```
┌────────────────────────────────────────────────────────────┐
│ SecclService (Mock Implementation)                         │
│ • In-memory storage (JavaScript Maps)                     │
│ • Simulated fund purchases (fixed price: £2.27/share)    │
│ • Instant transaction settlement (no delays)               │
│ • Account summary aggregation                              │
└────────────────────────────────────────────────────────────┘
                          ↓ ↑
┌────────────────────────────────────────────────────────────┐
│ In-Memory Data Structures                                  │
│ • Map<accountId, Account>                                 │
│ • Map<transactionId, Transaction>                         │
│ • Map<positionKey, Position>                              │
│ • Map<accountId, Summary>                                 │
└────────────────────────────────────────────────────────────┘
```

**Implementation Details:**
```typescript
@Injectable()
export class SecclService {
  // In-memory storage
  private accounts: Map<string, any> = new Map();
  private transactions: Map<string, any> = new Map();
  private positions: Map<string, any> = new Map();

  // Simulated constants
  private readonly FUND_ID = '275F1';
  private readonly FUND_NAME = 'Money Market Fund';
  private readonly SHARE_PRICE = 227; // £2.27 in pence
  private readonly FEE_PERCENTAGE = 2; // 2% fee

  async createTransactionGroup(request: CreateTransactionGroupDto) {
    const groupId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Payment transaction (conceptual money movement)
    const paymentTxn = {
      id: `PAY-${Date.now()}`,
      type: 'PAYMENT',
      amount: request.amount,
      status: 'PENDING',
      createdAt: new Date(),
    };

    // Order transaction (fund purchase)
    const orderTxn = {
      id: `ORD-${Date.now()}`,
      type: 'ORDER',
      fundId: this.FUND_ID,
      amount: request.amount * (1 - this.FEE_PERCENTAGE / 100),
      status: 'PENDING',
      createdAt: new Date(),
    };

    this.transactions.set(paymentTxn.id, paymentTxn);
    this.transactions.set(orderTxn.id, orderTxn);

    return { groupId, payment: paymentTxn, order: orderTxn };
  }

  async completeTransaction(transactionId: string, action: 'COMPLETE_PAYMENT' | 'BUY') {
    const txn = this.transactions.get(transactionId);

    if (action === 'BUY') {
      // Calculate shares purchased
      const amountAfterFee = txn.amount;
      const quantity = Math.floor(amountAfterFee / this.SHARE_PRICE);

      txn.status = 'ORDER_COMPLETED';
      txn.executedQuantity = quantity;
      txn.executionPrice = this.SHARE_PRICE;

      // Create or update position
      const positionKey = `${txn.accountId}-${this.FUND_ID}`;
      const existingPosition = this.positions.get(positionKey);

      if (existingPosition) {
        // Accumulate shares (CRITICAL: don't replace)
        existingPosition.quantity += quantity;
        existingPosition.bookValue += amountAfterFee;
      } else {
        this.positions.set(positionKey, {
          fundId: this.FUND_ID,
          fundName: this.FUND_NAME,
          quantity,
          bookValue: amountAfterFee,
        });
      }
    }

    return txn;
  }
}
```

**Rationale:**
- **No External Dependency**: Works without Seccl sandbox credentials
- **Fast Development**: Instant feedback, no network delays
- **Predictable**: Same results every time (good for testing)
- **Prototype Focus**: 2-hour constraint requires pragmatic choices

**Future Migration Path:**
When moving to production:
1. Create `SecclApiClient` (similar to PlaidService pattern)
2. Replace in-memory Maps with actual API calls
3. Handle async settlement (webhooks)
4. Implement reconciliation logic

**Trade-offs:**
- ✅ Zero external dependencies
- ✅ Fast iteration and testing
- ✅ Clear separation (easy to replace later)
- ❌ Not production-ready (acceptable - clearly documented)
- ❌ Data lost on restart (acceptable - mock data)

---

## 6. API Design

### RESTful API Principles

**Decision:** REST API with OpenAPI specification

**Endpoint Structure:**
```
/api/auth
  POST   /register          - User registration
  POST   /login             - User authentication

/api/bank-connections
  POST   /plaid/link-token  - Create Plaid Link token
  POST   /plaid/exchange-token - Exchange public token
  GET    /                  - List bank connections
  GET    /:id               - Get connection details
  POST   /:id/sync          - Sync connection data
  DELETE /:id               - Remove connection

/api/bank-accounts
  GET    /                  - List bank accounts
  GET    /consolidated-balance - Total balance across accounts
  GET    /:id               - Get account details
  GET    /:id/transactions  - Get account transactions

/api/investments
  POST   /accounts          - Create investment account
  GET    /accounts          - List investment accounts
  GET    /accounts/:id/summary - Get account summary
  POST   /orders            - Create investment order (requires Idempotency-Key)
  GET    /orders            - List investment orders
  GET    /positions         - List investment positions
```

**Rationale:**
- **Standard**: Industry-standard REST conventions
- **Predictable**: Consistent URL patterns
- **Documented**: Self-documenting with OpenAPI
- **HTTP Semantics**: Proper use of GET/POST/DELETE methods

### OpenAPI Documentation Strategy

**Decision:** Dual documentation with Scalar (modern) + Swagger (compatibility)

**Implementation:**
```typescript
// Single source of truth: openapi.config.ts
export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Rest Treasury API')
    .setDescription('Production-ready treasury management system...')
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter JWT token',
      name: 'Authorization',
      in: 'header',
    }, 'JWT')
    .addTag('Auth', 'Authentication and user management')
    .addTag('Plaid', 'Plaid Link and bank connectivity')
    .addTag('Bank Connections', 'Manage bank connections')
    .addTag('Bank Accounts', 'View bank accounts and transactions')
    .addTag('Investments', 'Investment accounts and orders')
    .build();

  return SwaggerModule.createDocument(app, config);
}

// main.ts - Reuse for both UIs
const openApiDocument = createOpenApiDocument(app);

// Swagger UI (traditional - for compatibility)
SwaggerModule.setup('api', app, openApiDocument);

// Scalar (modern - beautiful UI for demos)
app.use('/reference', apiReference({
  content: openApiDocument,
  theme: 'purple',
}));
```

**Rationale:**
- **DRY Principle**: Single OpenAPI config for both UIs
- **Developer Experience**: Scalar provides beautiful, modern UI
- **Compatibility**: Swagger UI for tools that expect it
- **Interactive Testing**: Both UIs allow live API testing

**Trade-offs:**
- ✅ Best of both worlds (modern + compatible)
- ✅ Maintainable (single source of truth)
- ❌ Slight bundle size increase (negligible)

### DTO Strategy

**Decision:** Separate Request DTOs and Response DTOs

**Pattern:**
```typescript
// Request DTO (Input validation)
export class CreateInvestmentOrderDto {
  @ApiProperty({
    description: 'Seccl account ID',
    example: 'acc-123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  secclAccountId: string;

  @ApiProperty({
    description: 'Investment amount in pence (£100 = 10000)',
    example: 10000,
    minimum: 100,
  })
  @IsInt()
  @Min(100)
  amount: number;
}

// Response DTO (API contract)
export class InvestmentOrderResponseDto {
  @ApiProperty({ description: 'Order ID' })
  id: string;

  @ApiProperty({ description: 'Fund ID', example: '275F1' })
  fundId: string;

  @ApiProperty({ description: 'Fund name' })
  fundName: string;

  @ApiProperty({ description: 'Investment amount in pence' })
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'GBP' })
  currency: string;

  @ApiProperty({ description: 'Order status' })
  status: string;

  @ApiProperty({ description: 'Number of shares purchased', nullable: true })
  executedQuantity: number | null;

  @ApiProperty({ description: 'Execution price per share in pence', nullable: true })
  executionPrice: number | null;

  @ApiProperty({ description: 'Order creation timestamp' })
  createdAt: Date;
}
```

**Rationale:**
- **Validation**: Request DTOs ensure valid input
- **Documentation**: OpenAPI decorators auto-generate docs
- **API Contract**: Response DTOs define what clients receive
- **Decoupling**: DTOs protect internal domain models from API changes

**Trade-offs:**
- ✅ Type-safe API contracts
- ✅ Self-documenting code
- ✅ Validation at entry point
- ❌ Some boilerplate (acceptable - clarity worth it)

---

## 7. Testing Strategy

### Three-Tier Testing Architecture

**Decision:** Unit + Integration + E2E testing strategy

```
┌──────────────────────────────────────────────────────────────┐
│ 1. UNIT TESTS (src/**/__tests__/*.spec.ts)                  │
│                                                               │
│ • Co-located with source code                               │
│ • Mock all external dependencies                            │
│ • Test business logic in isolation                          │
│ • Fast execution (<1s total)                                │
│                                                               │
│ Example: PlaidService unit tests                            │
│   - Mock PlaidApi client                                    │
│   - Test token exchange logic                               │
│   - Test retry behavior                                     │
│   - Test error handling                                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 2. INTEGRATION TESTS (tests/integration/*.int.spec.ts)      │
│                                                               │
│ • Real database operations (PostgreSQL test instance)       │
│ • Test repository layer with Prisma                         │
│ • Test service orchestration                                │
│ • Slower execution (~5-10s total)                           │
│                                                               │
│ Example: BankConnection integration tests                   │
│   - Real Prisma transactions                                │
│   - Database constraint validation                          │
│   - Repository method verification                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 3. E2E TESTS (tests/e2e/*.e2e.spec.ts)                      │
│                                                               │
│ • Full application with real HTTP requests                  │
│ • Real database + mock external APIs (Plaid, Seccl)        │
│ • Test complete user workflows                              │
│ • Slowest execution (~30s-1min total)                       │
│                                                               │
│ Example: Plaid Link flow E2E test                           │
│   - POST /api/auth/login                                    │
│   - POST /api/bank-connections/plaid/link-token            │
│   - POST /api/bank-connections/plaid/exchange-token        │
│   - GET /api/bank-accounts                                  │
│   - Verify database state after flow                        │
└──────────────────────────────────────────────────────────────┘
```

**Test Pyramid:**
```
        ╱╲
       ╱  ╲       E2E Tests
      ╱    ╲      (10-20 tests - critical flows)
     ╱──────╲
    ╱        ╲    Integration Tests
   ╱          ╲   (50-100 tests - repository + service)
  ╱────────────╲
 ╱              ╲ Unit Tests
╱────────────────╲ (200-500 tests - all business logic)
```

**Rationale:**
- **Fast Feedback**: Unit tests run in milliseconds
- **Confidence**: Integration tests verify database operations
- **Regression Prevention**: E2E tests catch breaking changes
- **Debugging**: Failure at any level pinpoints the issue

**Trade-offs:**
- ✅ Comprehensive coverage at all levels
- ✅ Fast local development (unit tests)
- ✅ Production confidence (E2E tests)
- ❌ More test code to maintain (acceptable - prevents bugs)

### Test Quality Standards

**Financial Operations Testing:**
```typescript
describe('InvestmentService - Financial Safety', () => {
  it('should enforce idempotency (same key returns same order)', async () => {
    const idempotencyKey = 'test-idempotency-key-123';

    const firstOrder = await service.createInvestmentOrder(userId, dto, idempotencyKey);
    const secondOrder = await service.createInvestmentOrder(userId, dto, idempotencyKey);

    expect(firstOrder.id).toBe(secondOrder.id);

    // Verify only ONE order created in database
    const orders = await orderRepo.findByUserId(userId);
    expect(orders).toHaveLength(1);
  });

  it('should handle concurrent orders without duplicates', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      service.createInvestmentOrder(userId, dto, `concurrent-key-${i}`)
    );

    const results = await Promise.all(promises);
    const uniqueIds = new Set(results.map(r => r.id));

    expect(uniqueIds.size).toBe(10); // All unique orders
  });

  it('should rollback on external API failure', async () => {
    jest.spyOn(secclService, 'createTransactionGroup').mockRejectedValue(
      new Error('Seccl API timeout')
    );

    await expect(
      service.createInvestmentOrder(userId, dto, 'test-key')
    ).rejects.toThrow();

    // Verify NO order created in database (rollback successful)
    const orders = await orderRepo.findByUserId(userId);
    expect(orders).toHaveLength(0);
  });
});
```

**Rationale:**
- **Financial Safety**: Idempotency, atomicity, rollback tested explicitly
- **Concurrency**: Race condition testing prevents production bugs
- **Edge Cases**: Error scenarios tested thoroughly

---

## 8. Error Handling

### Hierarchical Exception Strategy

**Decision:** Custom exception classes extending NestJS HttpException

**Exception Hierarchy:**
```
HttpException (NestJS base)
    │
    ├── PlaidIntegrationException (502 Bad Gateway)
    │   ├── Used when Plaid API fails
    │   └── Includes original error code for debugging
    │
    ├── SecclIntegrationException (502 Bad Gateway)
    │   ├── Used when Seccl API fails
    │   └── Includes transaction context
    │
    ├── InsufficientFundsException (422 Unprocessable Entity)
    │   ├── Used when bank balance too low
    │   └── Includes requested vs available amounts
    │
    ├── DuplicateResourceException (409 Conflict)
    │   ├── Used for unique constraint violations
    │   └── User-friendly message
    │
    └── ResourceNotFoundException (404 Not Found)
        ├── Used when resource doesn't exist
        └── Includes resource type and ID
```

**Implementation Example:**
```typescript
export class PlaidIntegrationException extends HttpException {
  constructor(
    message: string,
    public readonly originalError?: any,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        message,
        error: 'PlaidIntegrationError',
        errorCode: originalError?.response?.data?.error_code,
        displayType: originalError?.response?.data?.display_message,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

// Usage in service
try {
  const response = await this.plaidClient.exchangePublicToken(publicToken);
  return response.data;
} catch (error) {
  this.logger.error('Plaid token exchange failed', {
    error: error.message,
    errorCode: error.response?.data?.error_code,
  });
  throw new PlaidIntegrationException('Token exchange failed', error);
}
```

**Global Exception Filter:**
```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message = typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message;
      errorCode = (exceptionResponse as any).error || 'HTTP_EXCEPTION';
    }

    // CRITICAL: Never expose sensitive data in error responses
    const sanitizedError = {
      statusCode: status,
      message,
      error: errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Log with full context (including stack trace)
    this.logger.error('Request failed', {
      ...sanitizedError,
      stack: exception instanceof Error ? exception.stack : undefined,
      userId: request.user?.id,
      method: request.method,
      body: request.body,
    });

    // Return sanitized response to client
    response.status(status).json(sanitizedError);
  }
}
```

**Rationale:**
- **Type Safety**: Custom exceptions provide type-safe error handling
- **Context**: Each exception carries domain-specific context
- **Debugging**: Original errors preserved for logging
- **Security**: Sensitive data never exposed to clients

**Trade-offs:**
- ✅ Clear error semantics
- ✅ Easy to handle specific errors
- ✅ Consistent error responses
- ❌ More exception classes (acceptable - clarity worth it)

---

## 9. Code Quality Standards

### DRY (Don't Repeat Yourself) Principle

**Decision:** BaseService and BaseRepository patterns for shared logic

**BaseService Implementation:**
```typescript
export abstract class BaseService {
  protected abstract readonly logger: LoggerService;
  protected abstract readonly prisma: PrismaClient;

  protected async executeInTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        return await operation(tx);
      });
    } catch (error) {
      this.logger.error('Transaction failed', {
        service: this.constructor.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  protected async executeApiCall<T>(
    apiName: string,
    operation: string,
    apiCall: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    const errorHandler = new ApiErrorHandler(this.logger, apiName);

    this.logger.debug(`Executing ${apiName} API call`, {
      service: this.constructor.name,
      operation,
      ...context,
    });

    try {
      const result = await apiCall();
      this.logger.info(`${apiName} API call successful`, {
        service: this.constructor.name,
        operation,
        ...context,
      });
      return result;
    } catch (error) {
      errorHandler.handle(error, operation, {
        service: this.constructor.name,
        ...context,
      });
      throw error; // Never reached but satisfies TypeScript
    }
  }

  protected async executeApiCallWithRetry<T>(
    apiName: string,
    operation: string,
    apiCall: () => Promise<T>,
    options: RetryOptions = {},
    context?: Record<string, any>,
  ): Promise<T> {
    const errorHandler = new ApiErrorHandler(this.logger, apiName);
    const {
      retries = 3,
      factor = 2,
      minTimeout = 1000,
      maxTimeout = 10000,
      onlyRetryIf,
    } = options;

    let attempt = 0;

    while (attempt <= retries) {
      try {
        const result = await apiCall();
        if (attempt > 0) {
          this.logger.info(`${apiName} API call succeeded after retry`, {
            service: this.constructor.name,
            operation,
            attempt,
            ...context,
          });
        }
        return result;
      } catch (error) {
        attempt++;
        const shouldRetry = onlyRetryIf
          ? onlyRetryIf(error)
          : errorHandler.isRetryable(error);

        if (attempt > retries || !shouldRetry) {
          errorHandler.handle(error, operation, {
            service: this.constructor.name,
            attempts: attempt,
            ...context,
          });
        }

        const timeout = Math.min(
          minTimeout * Math.pow(factor, attempt - 1),
          maxTimeout,
        );

        this.logger.warn(`Retrying ${apiName} API call`, {
          service: this.constructor.name,
          operation,
          attempt,
          nextRetryIn: timeout,
          error: error instanceof Error ? error.message : 'Unknown error',
          ...context,
        });

        await this.sleep(timeout);
      }
    }
    throw new Error('Unexpected retry loop exit');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**BaseRepository Implementation:**
```typescript
export abstract class BaseRepository {
  protected abstract readonly logger: LoggerService;
  private errorHandler: DatabaseErrorHandler;

  constructor() {
    // Initialize error handler lazily to avoid circular dependency
  }

  protected initErrorHandler(): void {
    if (!this.errorHandler) {
      this.errorHandler = new DatabaseErrorHandler(this.logger);
    }
  }

  protected async executeQuery<T>(
    operation: string,
    query: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    this.initErrorHandler();

    this.logger.debug(`Executing database operation`, {
      repository: this.constructor.name,
      operation,
      ...context,
    });

    try {
      return await query();
    } catch (error) {
      this.errorHandler.handle(error, operation, {
        repository: this.constructor.name,
        ...context,
      });
    }
  }

  protected async executeQueryOrThrow<T>(
    operation: string,
    query: () => Promise<T | null>,
    entityName: string,
    context?: Record<string, any>,
  ): Promise<T> {
    const result = await this.executeQuery(operation, query, context);

    if (result === null) {
      this.logger.warn(`${entityName} not found`, {
        repository: this.constructor.name,
        operation,
        ...context,
      });
      throw new Error(`${entityName} not found`);
    }

    return result;
  }

  protected async executeMutation<T>(
    operation: string,
    mutation: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    const result = await this.executeQuery(operation, mutation, context);

    this.logger.info(`Database mutation completed`, {
      repository: this.constructor.name,
      operation,
      ...context,
    });

    return result;
  }

  protected async executeBulkOperation<T>(
    operation: string,
    bulkOp: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    this.initErrorHandler();

    this.logger.debug(`Executing bulk operation`, {
      repository: this.constructor.name,
      operation,
      ...context,
    });

    try {
      const result = await bulkOp();

      this.logger.info(`Bulk operation completed`, {
        repository: this.constructor.name,
        operation,
        ...context,
      });

      return result;
    } catch (error) {
      this.errorHandler.handle(error, operation, {
        repository: this.constructor.name,
        ...context,
      });
    }
  }
}
```

**Usage:**
```typescript
// All services extend BaseService
export class InvestmentService extends BaseService {
  async createInvestmentOrder(dto: CreateOrderDto) {
    // Automatically gets transaction management and retry logic
    return this.executeInTransaction(async (tx) => {
      // Business logic here
    });
  }
}

// All repositories extend BaseRepository
export class InvestmentOrderRepository extends BaseRepository {
  async create(tx: Prisma.TransactionClient, data: CreateOrderData) {
    this.logQuery('create', { userId: data.userId });
    try {
      return await tx.investmentOrder.create({ data });
    } catch (error) {
      this.handleError('create', error);
    }
  }
}
```

**Rationale:**
- **No Duplication**: Transaction logic written once, used everywhere
- **Consistency**: All services handle errors the same way
- **Maintainability**: Change once, updates everywhere

### File and Function Size Limits

**Decision:** Enforce maximum sizes for maintainability

**Limits:**
- **Maximum 250 lines per file** (excluding tests)
- **Maximum 70 lines per function** (excluding tests)

**Rationale:**
- **Readability**: Smaller files easier to understand
- **Single Responsibility**: Forces breaking down complex logic
- **Testability**: Smaller functions easier to test

**Enforcement:**
```typescript
// If file exceeds 250 lines, refactor into multiple files
// Example: investment.service.ts (300 lines) →
//   - investment.service.ts (core logic)
//   - investment-order-execution.service.ts (order execution)
//   - investment-position.service.ts (position management)

// If function exceeds 70 lines, extract helper functions
// Example:
async createInvestmentOrder(dto: CreateOrderDto) {
  return this.executeInTransaction(async (tx) => {
    const existingOrder = await this.checkIdempotency(tx, dto.idempotencyKey);
    if (existingOrder) return existingOrder;

    const order = await this.createOrder(tx, dto);
    await this.executeOrder(tx, order);
    await this.updatePosition(tx, order);

    return this.mapToDto(order);
  });
}

// Each helper function <70 lines
```

### Structured Logging (No console.log)

**Decision:** NEVER use console.log/console.error, always use LoggerService

**Logger Implementation:**
```typescript
@Injectable()
export class LoggerService implements NestLoggerService {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  setContext(context: string): void {
    this.context = context;
  }

  info(message: string, context?: Record<string, any>): void {
    this.print('info', message, context);
  }

  error(message: string, context?: Record<string, any>): void {
    this.print('error', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.print('warn', message, context);
  }

  debug(message: string, context?: Record<string, any>): void {
    this.print('debug', message, context);
  }

  private print(level: string, message: string, context?: Record<string, any>): void {
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
```

**Usage:**
```typescript
// ✅ CORRECT - Structured logging
this.logger.info('Investment order created', {
  orderId: order.id,
  userId: order.userId,
  amount: order.amount,
  fundId: order.fundId,
});

// ❌ WRONG - Console logging
console.log('Order created:', order); // No structure, no context!
```

**Rationale:**
- **Searchable**: Structured logs easy to query (JSON format)
- **Context**: Automatic request ID, timestamp, level
- **Production**: Works with log aggregators (Datadog, Splunk)

---

## 10. Technology Stack

### Core Technologies

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **NestJS** | ^10.0.0 | Backend framework | Type-safe, modular, production-ready |
| **TypeScript** | ^5.1.3 | Language | Type safety, better IDE support |
| **Prisma** | ^6.2.1 | ORM | Type-safe database access, migrations |
| **PostgreSQL** | 16 | Database | ACID compliance, JSON support, mature |
| **JWT** | ^10.2.0 | Authentication | Stateless, scalable, standard |
| **bcrypt** | ^5.1.1 | Password hashing | Industry standard, secure |
| **Plaid** | ^28.0.0 | Bank connectivity | Leading open banking platform |
| **Jest** | ^30.0.0 | Testing | Best-in-class testing framework |
| **Custom Logger** | - | Logging | JSON structured logging for production |

### Development Tools

| Tool | Purpose | Rationale |
|------|---------|-----------|
| **Docker Compose** | Local infrastructure | PostgreSQL container for development |
| **ESLint** | Code linting | Consistent code style, catch errors |
| **Prettier** | Code formatting | Automatic formatting, no debates |
| **Scalar** | API documentation | Modern, beautiful UI for demos |
| **Swagger** | API documentation | Compatibility with existing tools |
| **Postman** | API testing | Manual testing, collection sharing |

### Why NestJS?

**Chosen:** NestJS over Express, Fastify, Koa

**Rationale:**
- ✅ **TypeScript First**: Built for TypeScript from ground up
- ✅ **Dependency Injection**: Built-in DI container (testability)
- ✅ **Modularity**: Clear module boundaries
- ✅ **Decorators**: Clean, declarative code (@Controller, @Injectable)
- ✅ **OpenAPI Integration**: First-class Swagger/OpenAPI support
- ✅ **Testing**: Built-in testing utilities
- ✅ **Production Ready**: Used by enterprises worldwide

**Trade-offs:**
- ❌ Slightly heavier than raw Express (acceptable - features worth it)
- ❌ Learning curve for decorators (minimal - intuitive)

### Why Prisma?

**Chosen:** Prisma over TypeORM, Sequelize, raw SQL

**Rationale:**
- ✅ **Type Safety**: Auto-generated types from schema
- ✅ **Developer Experience**: Best-in-class autocomplete
- ✅ **Migrations**: Built-in migration system
- ✅ **Query Performance**: Efficient query generation
- ✅ **Maintenance**: Active development, great docs

**Trade-offs:**
- ❌ Abstraction layer (slight overhead - negligible)
- ❌ Less control than raw SQL (acceptable - 99% use cases covered)

### Why PostgreSQL?

**Chosen:** PostgreSQL over MySQL, MongoDB, SQLite

**Rationale:**
- ✅ **ACID Compliance**: Critical for financial transactions
- ✅ **JSON Support**: Flexible data structures when needed
- ✅ **Maturity**: Battle-tested, 25+ years old
- ✅ **Features**: Advanced indexing, full-text search, JSONB
- ✅ **Open Source**: No licensing concerns

**Trade-offs:**
- ❌ More resource-intensive than SQLite (acceptable - production-grade)
- ❌ Relational model (acceptable - fits our domain perfectly)

---

## Summary

This architecture balances **prototype speed** with **production readiness**:

### Prototype Optimizations:
- ✅ Mock Seccl service (in-memory) instead of real API
- ✅ Simplified error handling (no retry queues)
- ✅ Single monolithic application (no microservices)
- ✅ No advanced observability (no Datadog, Sentry)

### Production-Ready Patterns:
- ✅ Three-layer architecture (maintainable, testable)
- ✅ Field-level encryption (security from day one)
- ✅ Idempotency protection (financial safety)
- ✅ Comprehensive testing (unit + integration + e2e)
- ✅ Structured logging (production debugging)
- ✅ Real Plaid integration (demonstrates connectivity)

### Key Architectural Principles:

1. **Service Layer Owns Transactions** - Clear orchestration responsibility
2. **Repository Layer is Database-Only** - Pure data access, no business logic
3. **Hybrid Storage Model** - PostgreSQL for persistent data, in-memory for mock Seccl
4. **External Service Pattern** - Dedicated services for Plaid/Seccl with retry logic
5. **Idempotency by Default** - All financial mutations protected
6. **Type Safety Everywhere** - TypeScript + Prisma + DTOs
7. **DRY Principle** - BaseService/BaseRepository eliminate duplication
8. **Comprehensive Testing** - Unit + Integration + E2E at all layers
9. **Structured Logging** - No console.log, always LoggerService
10. **Security First** - Encryption, JWT, input validation from start

### Migration Path to Production:

When ready to deploy:
1. Replace mock Seccl with real API client (similar to PlaidService)
2. Add job queue (Bull/BullMQ) for async operations
3. Implement webhook handlers for Plaid/Seccl events
4. Add monitoring (Datadog, Sentry)
5. Implement rate limiting (Redis + @nestjs/throttler)
6. Add database read replicas for scaling
7. Deploy with container orchestration (Kubernetes)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-22
**Author:** Rest Treasury Development Team (with Claude Code)
