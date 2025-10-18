# Rest Treasury Service - Context for Claude

## Project Overview
Building a production-ready treasury management system that connects business bank accounts via Plaid, fetches consolidated balances and transactions, and simulates investment flows into money market funds via Seccl (or mock API). This is a prototype demonstrating end-to-end financial data connectivity with institutional-grade security patterns.

## Technology Stack
- **Backend**: NestJS + TypeScript + Prisma ORM + PostgreSQL
- **Bank Connectivity**: Plaid API (Sandbox)
- **Investment Platform**: Seccl API (Sandbox) or Mock Service
- **Security**: JWT authentication, field-level encryption for sensitive data
- **Testing**: Jest (unit + integration + E2E)
- **Infrastructure**: Docker Compose (NOT docker-compose - deprecated)

## Project Status
- **Phase**: Initial Setup
- **Current Milestone**: Bank Account Connectivity via Plaid
- **Next Steps**: Investment flow simulation

## Architecture Principles

### Layer Responsibilities & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Controller Layer (HTTP)                                      │
│ • Handles HTTP requests/responses                           │
│ • Input: Request DTOs (validation with class-validator)     │
│ • Output: Response DTOs (API contract)                      │
│ • Uses: @ApiResponse decorators with Response DTOs          │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
                    Response DTOs only
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│ Service Layer (Business Logic)                              │
│ • Orchestrates transactions and business operations         │
│ • Input: Request DTOs from controllers                      │
│ • Internal: Domain models from repositories                 │
│ • Output: Response DTOs (transforms via mappers)            │
│ • Transaction orchestration & error handling                │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
                     Domain models only
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│ Repository Layer (Data Access)                              │
│ • Pure database operations via Prisma                        │
│ • Input: Prisma.TransactionClient + domain parameters       │
│ • Output: Prisma types (domain models)                      │
│ • NO DTOs - uses Prisma-generated types only                │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│ External Services Layer (Plaid, Seccl)                      │
│ • API client wrappers with retry logic                      │
│ • Response mapping to internal domain models                │
│ • Idempotency key management                                │
│ • Webhook handling and signature verification               │
└─────────────────────────────────────────────────────────────┘
                            ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│ Database (PostgreSQL) + External APIs (Plaid/Seccl)         │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

**1. Service Layer Owns Transactions**
```typescript
// ✅ CORRECT - Service orchestrates transaction
async createBankConnection(userId: string, publicToken: string): Promise<BankConnectionDto> {
  return this.executeInTransaction(async (tx) => {
    // 1. Exchange public token with Plaid
    const plaidResponse = await this.plaidService.exchangePublicToken(publicToken);

    // 2. Store access token (encrypted)
    const connection = await this.bankConnectionRepo.create(tx, {
      userId,
      accessToken: this.encryptionService.encrypt(plaidResponse.access_token),
      itemId: plaidResponse.item_id,
      institutionId: plaidResponse.institution_id,
    });

    // 3. Fetch initial accounts
    await this.syncBankAccounts(tx, connection.id);

    return this.mapToDto(connection);
  });
}

// ❌ WRONG - Repository handles external API calls
async create(tx: Prisma.TransactionClient, data: CreateConnectionData) {
  const plaidResponse = await this.plaidApi.exchange(data.token); // NO!
  return tx.bankConnection.create({ ... });
}
```

**2. Repository Layer is Database-Only**
```typescript
// ✅ CORRECT - Pure database operations
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

  async updateSyncStatus(
    tx: Prisma.TransactionClient,
    id: string,
    status: SyncStatus
  ): Promise<BankConnection> {
    return tx.bankConnection.update({
      where: { id },
      data: { lastSyncStatus: status, lastSyncedAt: new Date() },
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

**3. External Service Layer Pattern**
```typescript
// ✅ CORRECT - Dedicated service for external APIs
@Injectable()
export class PlaidService {
  private client: PlaidApi;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.client = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': config.get('PLAID_CLIENT_ID'),
            'PLAID-SECRET': config.get('PLAID_SECRET'),
          },
        },
      })
    );
  }

  async createLinkToken(userId: string): Promise<LinkTokenCreateResponse> {
    try {
      const response = await this.client.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: 'Rest Treasury',
        products: [Products.Auth, Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      });

      this.logger.info('Plaid link token created', { userId, requestId: response.data.request_id });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create Plaid link token', { userId, error });
      throw new PlaidIntegrationException('Link token creation failed', error);
    }
  }

  async exchangePublicToken(publicToken: string): Promise<ItemPublicTokenExchangeResponse> {
    // Retry logic with exponential backoff
    return retry(
      async () => {
        const response = await this.client.itemPublicTokenExchange({ public_token: publicToken });
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
}
```

**4. Idempotency Pattern for Financial Operations**
```typescript
// ✅ CRITICAL - All financial mutations MUST be idempotent
@Injectable()
export class InvestmentService {
  async createInvestmentOrder(
    userId: string,
    dto: CreateInvestmentOrderDto,
    idempotencyKey: string
  ): Promise<InvestmentOrderDto> {
    return this.executeInTransaction(async (tx) => {
      // 1. Check for existing order with same idempotency key
      const existing = await this.investmentRepo.findByIdempotencyKey(tx, idempotencyKey);
      if (existing) {
        this.logger.info('Returning existing order (idempotent)', { idempotencyKey, orderId: existing.id });
        return this.mapToDto(existing);
      }

      // 2. Create new order
      const order = await this.investmentRepo.create(tx, {
        ...dto,
        userId,
        idempotencyKey,
        status: 'PENDING',
      });

      // 3. Submit to Seccl with idempotency
      try {
        const secclResponse = await this.secclService.placeOrder({
          ...order,
          clientReference: idempotencyKey, // Use same key for Seccl
        });

        // 4. Update with external reference
        await this.investmentRepo.update(tx, order.id, {
          externalOrderId: secclResponse.orderId,
          status: 'SUBMITTED',
        });
      } catch (error) {
        await this.investmentRepo.update(tx, order.id, { status: 'FAILED' });
        throw error;
      }

      return this.mapToDto(order);
    });
  }
}

// Controller enforces idempotency key
@Post('orders')
async createOrder(
  @Body() dto: CreateInvestmentOrderDto,
  @Headers('idempotency-key') idempotencyKey?: string,
) {
  if (!idempotencyKey) {
    throw new BadRequestException('Idempotency-Key header is required');
  }

  return this.investmentService.createInvestmentOrder(user.id, dto, idempotencyKey);
}
```

## Testing Architecture (Three-Tier Structure)

### 1. Unit Tests (`src/**/__tests__/`)
Co-located with source code for easy discovery:
```
src/plaid/__tests__/plaid.service.unit.test.ts
src/investment/__tests__/investment.service.unit.test.ts
src/bank-connection/__tests__/bank-connection.service.unit.test.ts
```

**Purpose**: Fast isolated tests of business logic with mocked external dependencies.

**Example Unit Test:**
```typescript
// src/plaid/__tests__/plaid.service.unit.test.ts
describe('PlaidService', () => {
  let service: PlaidService;
  let mockPlaidApi: jest.Mocked<PlaidApi>;

  beforeEach(() => {
    mockPlaidApi = {
      linkTokenCreate: jest.fn(),
      itemPublicTokenExchange: jest.fn(),
      accountsBalanceGet: jest.fn(),
    } as any;

    service = new PlaidService(mockConfig, mockLogger);
    service['client'] = mockPlaidApi;
  });

  describe('exchangePublicToken', () => {
    it('should successfully exchange public token', async () => {
      const mockResponse = {
        data: {
          access_token: 'access-sandbox-test',
          item_id: 'item-123',
          request_id: 'req-456',
        },
      };
      mockPlaidApi.itemPublicTokenExchange.mockResolvedValue(mockResponse);

      const result = await service.exchangePublicToken('public-sandbox-test');

      expect(result.access_token).toBe('access-sandbox-test');
      expect(mockPlaidApi.itemPublicTokenExchange).toHaveBeenCalledWith({
        public_token: 'public-sandbox-test',
      });
    });

    it('should retry on transient failures', async () => {
      mockPlaidApi.itemPublicTokenExchange
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ data: { access_token: 'success' } } as any);

      const result = await service.exchangePublicToken('public-test');

      expect(result.access_token).toBe('success');
      expect(mockPlaidApi.itemPublicTokenExchange).toHaveBeenCalledTimes(3);
    });

    it('should throw PlaidIntegrationException after max retries', async () => {
      mockPlaidApi.itemPublicTokenExchange.mockRejectedValue(new Error('Persistent failure'));

      await expect(service.exchangePublicToken('public-test')).rejects.toThrow(
        PlaidIntegrationException
      );
      expect(mockPlaidApi.itemPublicTokenExchange).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });
  });
});
```

### 2. Integration Tests (`tests/integration/`)
Tests database operations and module interactions:
```
tests/integration/
├── bank-connection.int.test.ts
├── plaid-sync.int.test.ts
├── investment-flow.int.test.ts
├── fixtures/
│   ├── user.fixtures.ts
│   └── plaid-response.fixtures.ts
└── helpers/
    └── test-helpers.ts
```

**Purpose**: Verify repository layer, Prisma queries, and service orchestration with real database.

**Example Integration Test:**
```typescript
// tests/integration/bank-connection.int.test.ts
describe('BankConnection Integration', () => {
  let prisma: PrismaService;
  let bankConnectionRepo: BankConnectionRepository;
  let testUser: User;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [PrismaService, BankConnectionRepository],
    }).compile();

    prisma = module.get(PrismaService);
    bankConnectionRepo = module.get(BankConnectionRepository);
  });

  beforeEach(async () => {
    await prisma.cleanDatabase();
    testUser = await prisma.user.create({
      data: { email: 'test@rest.com', name: 'Test User' },
    });
  });

  it('should create bank connection with encrypted access token', async () => {
    const connection = await prisma.$transaction(async (tx) => {
      return bankConnectionRepo.create(tx, {
        userId: testUser.id,
        accessToken: 'encrypted-access-token',
        itemId: 'item-sandbox-123',
        institutionId: 'ins_109508',
      });
    });

    expect(connection.id).toBeDefined();
    expect(connection.userId).toBe(testUser.id);
    expect(connection.accessToken).toBe('encrypted-access-token');

    // Verify database state
    const dbConnection = await prisma.bankConnection.findUnique({
      where: { id: connection.id },
    });
    expect(dbConnection).not.toBeNull();
    expect(dbConnection?.status).toBe('ACTIVE');
  });

  it('should enforce unique constraint on itemId per user', async () => {
    await prisma.bankConnection.create({
      data: {
        userId: testUser.id,
        accessToken: 'token-1',
        itemId: 'item-123',
        institutionId: 'ins_109508',
      },
    });

    // Attempt duplicate
    await expect(
      prisma.bankConnection.create({
        data: {
          userId: testUser.id,
          accessToken: 'token-2',
          itemId: 'item-123', // Same itemId
          institutionId: 'ins_109508',
        },
      })
    ).rejects.toThrow(/Unique constraint/);
  });
});
```

### 3. E2E Tests (`tests/e2e/`)
End-to-end HTTP API tests with complete infrastructure:
```
tests/e2e/
├── plaid-link.e2e.test.ts
├── bank-accounts.e2e.test.ts
├── investment-orders.e2e.test.ts
├── fixtures/
│   ├── plaid.fixtures.ts
│   └── seccl.fixtures.ts
└── helpers/
    ├── test-app.helper.ts
    ├── plaid-mock.helper.ts
    └── request-builder.helper.ts
```

**Purpose**: Test complete user flows through HTTP API with PostgreSQL + external service mocks.

**Example E2E Test:**
```typescript
// tests/e2e/plaid-link.e2e.test.ts
describe('Plaid Link Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUser: User;
  let authToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createE2ETestApp());
    testUser = await createTestUser(prisma);
    authToken = generateJWT(testUser.id);
  });

  afterAll(async () => {
    await cleanupE2ETestApp({ app, prisma });
  });

  describe('POST /api/plaid/link-token', () => {
    it('should create link token for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/plaid/link-token')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('linkToken');
      expect(response.body).toHaveProperty('expiration');
      expect(response.body.linkToken).toMatch(/^link-sandbox-/);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/plaid/link-token')
        .expect(401);
    });
  });

  describe('POST /api/plaid/exchange-token', () => {
    it('should exchange public token and create bank connection', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/plaid/exchange-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ publicToken: 'public-sandbox-test-token' })
        .expect(201);

      expect(response.body).toHaveProperty('connectionId');
      expect(response.body).toHaveProperty('institutionId');
      expect(response.body).toHaveProperty('accounts');
      expect(response.body.accounts.length).toBeGreaterThan(0);

      // Verify database state
      const connection = await prisma.bankConnection.findFirst({
        where: { userId: testUser.id },
        include: { accounts: true },
      });

      expect(connection).not.toBeNull();
      expect(connection?.accessToken).toBeDefined();
      expect(connection?.accounts.length).toBe(response.body.accounts.length);
    });

    it('should be idempotent (same public token returns same connection)', async () => {
      const publicToken = 'public-sandbox-idempotent';

      const firstResponse = await request(app.getHttpServer())
        .post('/api/plaid/exchange-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ publicToken })
        .expect(201);

      const secondResponse = await request(app.getHttpServer())
        .post('/api/plaid/exchange-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ publicToken })
        .expect(200); // 200 for existing connection

      expect(firstResponse.body.connectionId).toBe(secondResponse.body.connectionId);

      // Verify only one connection created
      const connections = await prisma.bankConnection.findMany({
        where: { userId: testUser.id },
      });
      expect(connections.length).toBe(1);
    });

    it('should handle Plaid API errors gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/plaid/exchange-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ publicToken: 'public-sandbox-invalid-token' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid public token');
    });
  });
});
```

### Test Quality Checklist

✅ **Core Functionality Tests:**
- [ ] Create, read, update, delete with success cases
- [ ] Authentication and authorization
- [ ] Input validation (required fields, formats, boundaries)
- [ ] Business logic verification

✅ **Edge Cases & Error Handling:**
- [ ] Invalid inputs (malformed UUIDs, missing fields)
- [ ] External API failures (Plaid timeout, Seccl 500 errors)
- [ ] Database constraint violations
- [ ] Concurrent operations (race conditions)
- [ ] Idempotency verification

✅ **Financial Operations (CRITICAL):**
- [ ] **Idempotency**: Same request produces same result
- [ ] **Atomicity**: All-or-nothing transactions
- [ ] **Auditability**: Every financial mutation logged
- [ ] **Reconciliation**: External state matches internal state

✅ **Security Tests:**
- [ ] Sensitive data encryption (access tokens, account numbers)
- [ ] JWT validation and expiration
- [ ] Rate limiting enforcement
- [ ] SQL injection prevention (Prisma handles this)

## Code Quality Standards

### Clean Code Principles

**1. Maximum File/Function Sizes**
- Maximum 250 lines per file (excluding tests)
- Maximum 70 lines per function (excluding tests)
- If exceeded, refactor into smaller modules

**2. Single Responsibility Principle**
```typescript
// ✅ CORRECT - Each class has one responsibility
export class PlaidService {
  // Only handles Plaid API communication
}

export class BankAccountSyncService {
  constructor(
    private readonly plaidService: PlaidService,
    private readonly bankAccountRepo: BankAccountRepository,
  ) {}

  // Only handles syncing logic
  async syncAccounts(connectionId: string) {
    const connection = await this.getConnection(connectionId);
    const accounts = await this.plaidService.getAccounts(connection.accessToken);
    return this.bankAccountRepo.upsertMany(tx, accounts);
  }
}

// ❌ WRONG - God class doing everything
export class BankService {
  async createConnection() { /* Plaid API */ }
  async syncAccounts() { /* Plaid API + DB */ }
  async createInvestment() { /* Seccl API + DB */ }
  async sendNotification() { /* Email */ }
  // Too many responsibilities!
}
```

**3. DRY (Don't Repeat Yourself)**
```typescript
// ✅ CORRECT - Reusable base service
export abstract class BaseService {
  protected async executeInTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      try {
        return await operation(tx);
      } catch (error) {
        this.logger.error('Transaction failed', { error, service: this.constructor.name });
        throw error;
      }
    });
  }

  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    return retry(operation, {
      retries: options.retries ?? 3,
      factor: options.factor ?? 2,
      minTimeout: options.minTimeout ?? 1000,
      onRetry: (error, attempt) => {
        this.logger.warn('Retrying operation', { attempt, error: error.message });
      },
    });
  }
}

// All services extend BaseService
export class BankConnectionService extends BaseService {
  async create(dto: CreateConnectionDto) {
    return this.executeInTransaction(async (tx) => {
      // Business logic
    });
  }
}

// ❌ WRONG - Duplicating transaction logic
export class BankConnectionService {
  async create(dto: CreateConnectionDto) {
    return this.prisma.$transaction(async (tx) => {
      try {
        // Business logic
      } catch (error) {
        this.logger.error('Transaction failed', { error });
        throw error;
      }
    });
  }
}

export class InvestmentService {
  async create(dto: CreateInvestmentDto) {
    return this.prisma.$transaction(async (tx) => {
      try {
        // Business logic (DUPLICATE!)
      } catch (error) {
        this.logger.error('Transaction failed', { error });
        throw error;
      }
    });
  }
}
```

**4. Structured Logging (NEVER use console.log)**
```typescript
// ✅ CORRECT - Structured logging with context
@Injectable()
export class PlaidService {
  constructor(private readonly logger: LoggerService) {}

  async exchangePublicToken(publicToken: string): Promise<TokenExchangeResponse> {
    this.logger.info('Exchanging Plaid public token', { publicTokenPrefix: publicToken.slice(0, 10) });

    try {
      const response = await this.client.itemPublicTokenExchange({ public_token: publicToken });

      this.logger.info('Public token exchanged successfully', {
        itemId: response.data.item_id,
        requestId: response.data.request_id,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Public token exchange failed', {
        error: error.message,
        errorCode: error.response?.data?.error_code,
        publicTokenPrefix: publicToken.slice(0, 10),
      });
      throw new PlaidIntegrationException('Token exchange failed', error);
    }
  }
}

// ❌ WRONG - Using console.log
async exchangePublicToken(publicToken: string) {
  console.log('Exchanging token'); // NO CONTEXT!

  try {
    const response = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    console.log('Success:', response); // UNSTRUCTURED!
    return response.data;
  } catch (error) {
    console.error(error); // NO CONTEXT, STACK TRACES IN LOGS!
    throw error;
  }
}
```

**5. Comprehensive Error Handling**
```typescript
// ✅ CORRECT - Custom exception hierarchy
export class PlaidIntegrationException extends HttpException {
  constructor(message: string, public readonly originalError?: any) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        message,
        error: 'PlaidIntegrationError',
        errorCode: originalError?.response?.data?.error_code,
      },
      HttpStatus.BAD_GATEWAY
    );
  }
}

export class InsufficientFundsException extends HttpException {
  constructor(accountId: string, requested: number, available: number) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Insufficient funds for investment order',
        error: 'InsufficientFunds',
        details: { accountId, requested, available },
      },
      HttpStatus.UNPROCESSABLE_ENTITY
    );
  }
}

// Global exception filter
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
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

    this.logger.error('Request failed', {
      ...sanitizedError,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json(sanitizedError);
  }
}

// ❌ WRONG - Generic error handling
catch (error) {
  throw new Error(error.message); // Loses context and type information
}
```

### Anti-Patterns (NEVER DO THIS)

**❌ Storing Unencrypted Sensitive Data**
```typescript
// WRONG - Plaintext access token
await prisma.bankConnection.create({
  data: {
    accessToken: plaidResponse.access_token, // SECURITY VIOLATION!
    userId,
  },
});

// CORRECT - Encrypted access token
await prisma.bankConnection.create({
  data: {
    accessToken: this.encryptionService.encrypt(plaidResponse.access_token),
    userId,
  },
});
```

**❌ Non-Idempotent Financial Operations**
```typescript
// WRONG - No idempotency protection
@Post('investment-orders')
async createOrder(@Body() dto: CreateOrderDto) {
  return this.investmentService.create(dto); // Duplicate requests = duplicate orders!
}

// CORRECT - Idempotency key required
@Post('investment-orders')
async createOrder(
  @Body() dto: CreateOrderDto,
  @Headers('idempotency-key') idempotencyKey?: string,
) {
  if (!idempotencyKey) {
    throw new BadRequestException('Idempotency-Key header is required');
  }
  return this.investmentService.create(dto, idempotencyKey);
}
```

**❌ Missing Audit Logs for Financial Operations**
```typescript
// WRONG - No audit trail
async createInvestmentOrder(dto: CreateOrderDto) {
  return this.prisma.investmentOrder.create({ data: dto });
}

// CORRECT - Comprehensive audit logging
async createInvestmentOrder(userId: string, dto: CreateOrderDto, idempotencyKey: string) {
  return this.executeInTransaction(async (tx) => {
    const order = await this.orderRepo.create(tx, dto);

    // CRITICAL: Audit every financial mutation
    await this.auditRepo.log(tx, {
      userId,
      action: 'INVESTMENT_ORDER_CREATED',
      resourceType: 'INVESTMENT_ORDER',
      resourceId: order.id,
      metadata: {
        amount: dto.amount,
        fundId: dto.fundId,
        idempotencyKey,
      },
      ipAddress: this.request.ip,
      userAgent: this.request.headers['user-agent'],
    });

    return order;
  });
}
```

**❌ Exposing Internal IDs in API Responses**
```typescript
// WRONG - Database IDs exposed
export class BankAccountDto {
  id: number; // Sequential ID reveals total account count
  userId: number; // Exposes user ID
  accountNumber: string; // Sensitive!
}

// CORRECT - UUIDs and masked data
export class BankAccountDto {
  id: string; // UUID
  institutionName: string;
  accountType: string;
  mask: string; // Last 4 digits only (e.g., "****1234")
  availableBalance: number;
  currentBalance: number;
}
```

**❌ Synchronous Operations for Slow External APIs**
```typescript
// WRONG - Blocking request until sync completes
@Post('bank-connections/:id/sync')
async syncAccounts(@Param('id') id: string) {
  await this.plaidService.syncAccounts(id); // Takes 10+ seconds!
  return { message: 'Sync complete' };
}

// CORRECT - Asynchronous job queue
@Post('bank-connections/:id/sync')
async syncAccounts(@Param('id') id: string) {
  const job = await this.queueService.addJob('sync-accounts', { connectionId: id });
  return {
    jobId: job.id,
    status: 'QUEUED',
    message: 'Sync initiated. Use GET /jobs/:id to check status.',
  };
}
```

**❌ Hardcoded Configuration**
```typescript
// WRONG
const plaidClient = new PlaidApi({
  basePath: 'https://sandbox.plaid.com',
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': 'abc123',
      'PLAID-SECRET': 'secret456',
    },
  },
});

// CORRECT - Environment-based configuration
@Injectable()
export class PlaidService {
  private readonly client: PlaidApi;

  constructor(private readonly config: ConfigService) {
    const environment = config.get('PLAID_ENV');
    const basePath =
      environment === 'production'
        ? PlaidEnvironments.production
        : environment === 'development'
        ? PlaidEnvironments.development
        : PlaidEnvironments.sandbox;

    this.client = new PlaidApi(
      new Configuration({
        basePath,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': config.get('PLAID_CLIENT_ID'),
            'PLAID-SECRET': config.get('PLAID_SECRET'),
          },
        },
      })
    );
  }
}
```

## Security Best Practices

**1. Field-Level Encryption for Sensitive Data**
```typescript
// Encrypt before storing
const encrypted = this.encryptionService.encrypt(plaidResponse.access_token);
await this.bankConnectionRepo.create(tx, { accessToken: encrypted });

// Decrypt when using
const accessToken = this.encryptionService.decrypt(connection.accessToken);
const accounts = await this.plaidService.getAccounts(accessToken);
```

**2. Webhook Signature Verification**
```typescript
@Post('webhooks/plaid')
async handlePlaidWebhook(
  @Body() payload: PlaidWebhookPayload,
  @Headers('plaid-verification') signature: string,
) {
  // Verify signature before processing
  const isValid = this.webhookService.verifyPlaidSignature(payload, signature);
  if (!isValid) {
    throw new UnauthorizedException('Invalid webhook signature');
  }

  await this.webhookService.processPlaidWebhook(payload);
  return { received: true };
}
```

**3. Rate Limiting**
```typescript
// Apply to all financial endpoints
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
@Post('investment-orders')
async createOrder(@Body() dto: CreateOrderDto) {
  return this.investmentService.create(dto);
}
```

**4. Data Masking in Logs**
```typescript
// NEVER log sensitive data in plaintext
this.logger.info('Bank account created', {
  accountId: account.id,
  accountNumber: maskAccountNumber(account.accountNumber), // "****1234"
  // NEVER log full account number or access tokens
});
```

## Project Structure (Mandatory)

```
rest-backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── auth/                    # Authentication module
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts
│   │   └── __tests__/
│   │       └── auth.service.unit.test.ts
│   │
│   ├── plaid/                   # Plaid integration
│   │   ├── plaid.controller.ts
│   │   ├── plaid.service.ts
│   │   ├── dto/
│   │   │   ├── link-token.dto.ts
│   │   │   └── exchange-token.dto.ts
│   │   ├── exceptions/
│   │   │   └── plaid-integration.exception.ts
│   │   └── __tests__/
│   │       └── plaid.service.unit.test.ts
│   │
│   ├── bank-connection/         # Bank connection management
│   │   ├── bank-connection.controller.ts
│   │   ├── bank-connection.service.ts
│   │   ├── bank-connection.repository.ts
│   │   ├── dto/
│   │   │   ├── create-connection.dto.ts
│   │   │   └── connection-response.dto.ts
│   │   ├── mappers/
│   │   │   └── connection.mapper.ts
│   │   └── __tests__/
│   │       └── bank-connection.service.unit.test.ts
│   │
│   ├── bank-account/            # Bank account data
│   │   ├── bank-account.controller.ts
│   │   ├── bank-account.service.ts
│   │   ├── bank-account.repository.ts
│   │   ├── sync/
│   │   │   └── account-sync.service.ts
│   │   └── __tests__/
│   │
│   ├── investment/              # Investment flow (Seccl)
│   │   ├── investment.controller.ts
│   │   ├── investment.service.ts
│   │   ├── investment.repository.ts
│   │   ├── seccl/
│   │   │   └── seccl.service.ts
│   │   └── __tests__/
│   │
│   ├── common/                  # Shared utilities
│   │   ├── base/
│   │   │   ├── base.service.ts
│   │   │   └── base.repository.ts
│   │   ├── encryption/
│   │   │   └── encryption.service.ts
│   │   ├── logging/
│   │   │   └── logger.service.ts
│   │   ├── exceptions/
│   │   │   └── all-exceptions.filter.ts
│   │   └── decorators/
│   │
│   └── prisma/
│       ├── prisma.service.ts
│       └── schema.prisma
│
├── tests/
│   ├── integration/
│   │   ├── bank-connection.int.test.ts
│   │   ├── plaid-sync.int.test.ts
│   │   └── helpers/
│   │
│   └── e2e/
│       ├── plaid-link.e2e.test.ts
│       ├── bank-accounts.e2e.test.ts
│       ├── investment-orders.e2e.test.ts
│       ├── fixtures/
│       └── helpers/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── docker-compose.yml           # Use docker compose (NOT docker-compose)
├── Dockerfile
├── .env.example
├── tsconfig.json
└── jest.config.js
```

## Environment Variables (Type-Safe)

```typescript
// src/config/env.validation.ts
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsString, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  PLAID_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  PLAID_SECRET: string;

  @IsEnum(['sandbox', 'development', 'production'])
  PLAID_ENV: string;

  @IsString()
  @IsNotEmpty()
  ENCRYPTION_KEY: string; // 32-byte key for AES-256

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  SECCL_API_KEY?: string;

  @IsString()
  SECCL_BASE_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
```

## Quick Reference: Decision Matrix

| Task | Use This | NOT This |
|------|----------|----------|
| Transactions | Service layer | Repository layer |
| External API calls | Dedicated service (PlaidService) | Repository layer |
| Database operations | Repository layer | Service layer directly |
| Logging | Structured logger | console.log/console.error |
| Secrets | Environment variables + encryption | Hardcoded values |
| Sensitive data storage | Field-level encryption | Plaintext |
| Financial operations | Idempotency keys | Direct execution |
| Async operations | Job queue (Bull/BullMQ) | Blocking HTTP requests |
| Error handling | Custom exception classes | Generic Error |
| Testing | Three-tier (unit/int/e2e) | Only unit tests |

## Critical Reminders

1. **ALWAYS use `docker compose`** (NOT `docker-compose` - deprecated)
2. **NEVER log sensitive data** (access tokens, account numbers, SSNs)
3. **ALWAYS encrypt sensitive data at rest** (Plaid access tokens, Seccl API keys)
4. **ALWAYS require idempotency keys** for financial mutations
5. **ALWAYS audit financial operations** (create comprehensive audit logs)
6. **ALWAYS verify webhook signatures** before processing
7. **ALWAYS use structured logging** with context
8. **NEVER use console.log/console.error** (use LoggerService)
9. **ALWAYS use transactions** for multi-step database operations
10. **ALWAYS test race conditions** for concurrent financial operations

---

## Notes for AI Assistants

When generating code for this project:

1. ✅ ALWAYS follow the three-layer architecture (Controller → Service → Repository)
2. ✅ ALWAYS use BaseService and BaseRepository patterns
3. ✅ ALWAYS implement comprehensive error handling with custom exceptions
4. ✅ ALWAYS use structured logging (NEVER console.log)
5. ✅ ALWAYS encrypt sensitive data before storing
6. ✅ ALWAYS require idempotency keys for financial operations
7. ✅ ALWAYS create unit + integration + E2E tests
8. ✅ ALWAYS use TypeScript strict mode
9. ✅ NEVER store sensitive data in plaintext
10. ✅ NEVER expose internal database IDs in APIs

**These rules are non-negotiable for financial/treasury applications.**
