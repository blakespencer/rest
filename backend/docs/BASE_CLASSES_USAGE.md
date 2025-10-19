# Base Classes Usage Guide

## Overview

The base classes provide **super DRY** error handling patterns that eliminate boilerplate code. Every database query and API call is automatically wrapped with try-catch blocks, error logging, and intelligent error transformation.

---

## BaseRepository Pattern

### ✅ Clean Repository Code (With Base Classes)

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { BaseRepository } from '../common/base/base.repository';
import { LoggerService } from '../common/logging/logger.service';

@Injectable()
export class UserRepository extends BaseRepository {
  protected readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    super();
    this.logger = logger;
  }

  /**
   * Find user by ID
   * ✅ Zero boilerplate - error handling automatic
   */
  async findById(tx: Prisma.TransactionClient, id: string): Promise<User | null> {
    return this.executeQuery(
      'findUserById',
      () => tx.user.findUnique({ where: { id } }),
      { userId: id },
    );
  }

  /**
   * Find user by email or throw
   * ✅ Automatically throws RecordNotFoundException if null
   */
  async findByEmailOrThrow(
    tx: Prisma.TransactionClient,
    email: string,
  ): Promise<User> {
    return this.executeQueryOrThrow(
      'findUserByEmail',
      () => tx.user.findUnique({ where: { email } }),
      'User',
      { email },
    );
  }

  /**
   * Create user
   * ✅ Automatic logging + error handling for unique constraint violations
   */
  async create(
    tx: Prisma.TransactionClient,
    data: Prisma.UserCreateInput,
  ): Promise<User> {
    return this.executeMutation(
      'createUser',
      () => tx.user.create({ data }),
      { email: data.email },
    );
  }

  /**
   * Update user
   * ✅ Handles P2025 (record not found) automatically
   */
  async update(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.UserUpdateInput,
  ): Promise<User> {
    return this.executeMutation(
      'updateUser',
      () => tx.user.update({ where: { id }, data }),
      { userId: id },
    );
  }

  /**
   * Bulk create
   * ✅ Special logging for bulk operations
   */
  async createMany(
    tx: Prisma.TransactionClient,
    users: Prisma.UserCreateManyInput[],
  ): Promise<Prisma.BatchPayload> {
    return this.executeBulkOperation(
      'createManyUsers',
      () => tx.user.createMany({ data: users }),
      { count: users.length },
    );
  }
}
```

### ❌ Without Base Classes (Old Pattern - DON'T DO THIS)

```typescript
// ❌ TONS of boilerplate in every method
async findById(tx: Prisma.TransactionClient, id: string): Promise<User | null> {
  try {
    this.logger.debug('Finding user by ID', { userId: id });
    const user = await tx.user.findUnique({ where: { id } });
    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error('Database error', { code: error.code, userId: id });
      if (error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }
      throw new InternalServerErrorException('Database error');
    }
    this.logger.error('Unknown error', { error });
    throw error;
  }
}

// ❌ Repeat this for EVERY method... dozens of lines of duplication!
```

---

## BaseService Pattern

### ✅ Clean Service Code (With Base Classes)

```typescript
import { Injectable } from '@nestjs/common';
import { BaseService } from '../common/base/base.service';
import { LoggerService } from '../common/logging/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { PlaidApi } from 'plaid';

@Injectable()
export class BankConnectionService extends BaseService {
  protected readonly logger: LoggerService;
  protected readonly prisma: PrismaService;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly plaidApi: PlaidApi,
  ) {
    super();
    this.logger = logger;
    this.prisma = prisma;
    this.logger.setContext('BankConnectionService');
  }

  /**
   * Create bank connection with Plaid integration
   * ✅ Transaction + API call error handling automatic
   */
  async createConnection(userId: string, publicToken: string): Promise<BankConnection> {
    return this.executeInTransaction(async (tx) => {
      // 1. Exchange token with Plaid (automatic retry on network errors)
      const plaidResponse = await this.executeApiCallWithRetry(
        'Plaid',
        'exchangePublicToken',
        () => this.plaidApi.itemPublicTokenExchange({ public_token: publicToken }),
        { retries: 3, minTimeout: 1000, maxTimeout: 5000 },
        { userId },
      );

      // 2. Encrypt access token
      const encryptedToken = this.encryption.encrypt(plaidResponse.data.access_token);

      // 3. Fetch institution details
      const institution = await this.executeApiCall(
        'Plaid',
        'getInstitution',
        () => this.plaidApi.institutionsGetById({
          institution_id: plaidResponse.data.institution_id,
          country_codes: ['US'],
        }),
        { institutionId: plaidResponse.data.institution_id },
      );

      // 4. Save to database (automatic error handling for unique constraints)
      const connection = await this.connectionRepo.create(tx, {
        userId,
        accessToken: encryptedToken,
        itemId: plaidResponse.data.item_id,
        institutionId: plaidResponse.data.institution_id,
        institutionName: institution.data.institution.name,
      });

      return connection;
    });
  }

  /**
   * Sync accounts from Plaid
   * ✅ Clean API call with automatic retry
   */
  async syncAccounts(connectionId: string): Promise<Account[]> {
    return this.executeInTransaction(async (tx) => {
      // Get connection
      const connection = await this.connectionRepo.findByIdOrThrow(
        tx,
        connectionId,
      );

      // Decrypt access token
      const accessToken = this.encryption.decrypt(connection.accessToken);

      // Fetch accounts from Plaid with retry
      const accountsResponse = await this.executeApiCallWithRetry(
        'Plaid',
        'getAccounts',
        () => this.plaidApi.accountsGet({ access_token: accessToken }),
        { retries: 3 },
        { connectionId },
      );

      // Upsert accounts
      return this.accountRepo.upsertMany(tx, accountsResponse.data.accounts);
    });
  }
}
```

### ❌ Without Base Classes (Old Pattern - DON'T DO THIS)

```typescript
// ❌ Massive boilerplate for every API call
async syncAccounts(connectionId: string): Promise<Account[]> {
  try {
    return await this.prisma.$transaction(async (tx) => {
      try {
        const connection = await tx.bankConnection.findUnique({
          where: { id: connectionId },
        });
        if (!connection) throw new NotFoundException('Connection not found');
      } catch (error) {
        // Handle database errors...
        throw error;
      }

      const accessToken = this.encryption.decrypt(connection.accessToken);

      // Manual retry logic
      let retries = 3;
      let lastError: any;

      while (retries > 0) {
        try {
          const response = await this.plaidApi.accountsGet({ access_token: accessToken });
          // Success...
          return await this.upsertAccounts(tx, response.data.accounts);
        } catch (error) {
          lastError = error;
          retries--;

          // Check if retryable...
          if (error.response?.status === 401) {
            throw new UnauthorizedException('Plaid auth failed');
          }

          if (retries === 0) {
            this.logger.error('Plaid API failed', { error });
            throw new BadGatewayException('Plaid API error');
          }

          // Wait before retry...
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      throw lastError;
    });
  } catch (error) {
    // More error handling...
    throw error;
  }
}

// ❌ Every method requires 50+ lines for what should be 10!
```

---

## Automatic Error Handling

### Database Errors

The `DatabaseErrorHandler` automatically maps Prisma errors:

| Prisma Code | Exception | HTTP Status | When It Happens |
|-------------|-----------|-------------|-----------------|
| `P2002` | `UniqueConstraintViolationException` | 409 | Duplicate email/itemId |
| `P2025` | `RecordNotFoundException` | 404 | Update/delete non-existent record |
| `P2003` | `ForeignKeyConstraintException` | 400 | Invalid userId reference |
| `P2014` | `DatabaseException` | 400 | Missing required relation |
| `P2021` | `DatabaseException` | 500 | Table doesn't exist (schema issue) |

**Example:**
```typescript
// ❌ OLD: Manual error handling
try {
  await tx.user.create({ data: { email: 'test@example.com' } });
} catch (error) {
  if (error.code === 'P2002') {
    throw new ConflictException('Email already exists');
  }
  throw error;
}

// ✅ NEW: Automatic - just call executeMutation
return this.executeMutation(
  'createUser',
  () => tx.user.create({ data: { email: 'test@example.com' } }),
);
// Automatically throws UniqueConstraintViolationException (409) if duplicate
```

### API Errors

The `ApiErrorHandler` categorizes external API errors:

| Error Type | HTTP Status | Auto Retry? | Examples |
|------------|-------------|-------------|----------|
| `NETWORK_ERROR` | 503 | ✅ Yes | ECONNREFUSED, ENOTFOUND |
| `TIMEOUT` | 504 | ✅ Yes | ETIMEDOUT |
| `SERVER_ERROR` | 502 | ✅ Yes | 500, 502, 503 from API |
| `RATE_LIMIT` | 429 | ❌ No | 429 from API |
| `AUTHENTICATION` | 401 | ❌ No | 401, 403 from API |
| `NOT_FOUND` | 404 | ❌ No | 404 from API |
| `BAD_REQUEST` | 400 | ❌ No | 400 from API |

**Example:**
```typescript
// ❌ OLD: Manual retry logic
let retries = 3;
while (retries > 0) {
  try {
    return await plaidApi.getAccounts();
  } catch (error) {
    if (error.response?.status >= 500 && retries > 0) {
      retries--;
      await sleep(1000);
    } else {
      throw error;
    }
  }
}

// ✅ NEW: One line - automatic retry on network/server errors
return this.executeApiCallWithRetry(
  'Plaid',
  'getAccounts',
  () => plaidApi.getAccounts(),
);
```

---

## Benefits Summary

### Code Reduction
- **Repository methods**: ~80% less code (10 lines vs 50+)
- **Service methods**: ~70% less code (15 lines vs 50+)
- **Error handling**: 100% consistent across entire codebase

### Maintainability
- ✅ Change error handling logic **once** in base class
- ✅ Add new error types **once** in error handler
- ✅ Update logging format **once** in base class
- ✅ Modify retry strategy **once** in base service

### Developer Experience
- ✅ New developers write correct error handling automatically
- ✅ Code reviews focus on business logic, not boilerplate
- ✅ Tests focus on happy path, error cases covered by base classes

### Production Quality
- ✅ Structured logging on every database/API operation
- ✅ Automatic retry on transient failures
- ✅ Meaningful error messages for users
- ✅ Detailed error logs for debugging
- ✅ HTTP status codes always correct

---

## Quick Reference

### Repository Methods

```typescript
// Query (read) - returns null if not found
this.executeQuery('operationName', () => tx.model.find())

// Query or throw - throws RecordNotFoundException if null
this.executeQueryOrThrow('operationName', () => tx.model.find(), 'ModelName')

// Mutation (create/update/delete) - logs successful mutations
this.executeMutation('operationName', () => tx.model.create())

// Bulk operation - special logging
this.executeBulkOperation('operationName', () => tx.model.createMany())
```

### Service Methods

```typescript
// Database transaction - automatic rollback on error
this.executeInTransaction(async (tx) => {
  // Your transaction logic
})

// API call - no retry
this.executeApiCall('ApiName', 'operation', () => api.call())

// API call with retry - retries on network/timeout/5xx errors
this.executeApiCallWithRetry('ApiName', 'operation', () => api.call(), {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 10000,
})
```

---

**Last Updated:** 2025-10-18
