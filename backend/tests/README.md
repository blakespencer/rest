# Testing Guide for Rest Treasury Service

This guide explains how to run unit, integration, and E2E tests for the Rest Treasury backend.

## Test Structure

```
tests/
├── integration/           # Integration tests (real DB, mocked external APIs)
├── e2e/                  # End-to-end tests (real DB, real Plaid sandbox)
├── helpers/              # Test utilities (app setup, auth helpers)
└── fixtures/             # Test data (users, Plaid responses)

src/**/__ tests__/        # Unit tests (co-located with source code)
```

## Test Types

### 1. Unit Tests (`src/**/__tests__/*.spec.ts`)

**What they test:**
- Business logic in isolation
- All external dependencies mocked (Plaid API, database)
- Fast execution (< 1 second per test)

**How to run:**
```bash
npm test                           # All unit tests
npm test -- bank-connection        # Specific test file
npm test -- --coverage             # With coverage report
```

**Current coverage:** 231 unit tests passing

### 2. Integration Tests (`tests/integration/*.int.spec.ts`)

**What they test:**
- Database operations with real PostgreSQL
- Service orchestration and transactions
- Plaid service is mocked for speed and reliability

**How to run:**
```bash
npm run test:integration
```

**Prerequisites:**
- PostgreSQL running (via `docker compose up -d postgres`)
- DATABASE_URL in `.env.test`

**What they verify:**
- Database constraints (foreign keys, unique constraints)
- Transaction atomicity and rollbacks
- Soft delete patterns
- Multi-user data isolation
- Balance storage in cents (currency precision)

### 3. E2E Tests (`tests/e2e/*.e2e.spec.ts`)

**What they test:**
- Complete HTTP API flows
- Real Plaid sandbox API integration
- Authentication (JWT)
- End-to-end user journeys

**How to run:**
```bash
npm run test:e2e
```

**Prerequisites:**
- PostgreSQL running
- Real Plaid sandbox credentials in `.env.test`:
  ```
  PLAID_CLIENT_ID=your_sandbox_client_id
  PLAID_SECRET=your_sandbox_secret
  PLAID_ENV=sandbox
  ```

**To skip E2E tests (if no Plaid credentials):**
```bash
# In .env.test
SKIP_PLAID_E2E=true
```

---

## Testing with Real Plaid Sandbox

### Getting Plaid Sandbox Credentials

1. Sign up for Plaid at https://dashboard.plaid.com/signup
2. Create a new application in sandbox mode
3. Copy your `client_id` and `secret` to `.env.test`

### Plaid Sandbox Test Data

Plaid sandbox provides **deterministic test data**:

#### Test Institutions
- **Tartan Bank** (`ins_109508`) - First Platypus Bank
- **Chase** (`ins_56`) - Chase sandbox

#### Test Credentials (for Plaid Link UI)
- **Successful auth**: username: `user_good`, password: `pass_good`
- **Failed auth**: username: `user_bad`, password: `pass_bad`
- **Custom scenarios**: username: `user_custom`, password: `pass_good`

### How Plaid Sandbox Works

1. **Real API calls**: Tests make actual HTTP requests to `https://sandbox.plaid.com`
2. **No real bank data**: All data is mocked by Plaid
3. **Deterministic**: Same credentials always return same test accounts
4. **No Link UI needed**: You can create sandbox tokens programmatically

### Creating Test Tokens Programmatically

Plaid sandbox provides `/sandbox/public_token/create` endpoint:

```typescript
// Example: Create sandbox public token without Link UI
const response = await fetch('https://sandbox.plaid.com/sandbox/public_token/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    client_id: process.env.PLAID_CLIENT_ID,
    secret: process.env.PLAID_SECRET,
    institution_id: 'ins_109508', // Tartan Bank
    initial_products: ['auth', 'transactions'],
  }),
});

const { public_token } = await response.json();

// Use this token in your E2E tests
```

### Example E2E Test Flow

```typescript
// 1. Create user and login
const user = await createTestUser(prisma);
const authToken = generateTestJWT(user);

// 2. Create link token
const linkTokenResponse = await request(app)
  .post('/plaid/link-token')
  .set('Authorization', `Bearer ${authToken}`)
  .expect(201);

// 3. Simulate user completing Plaid Link
// (In real test, use /sandbox/public_token/create)
const publicToken = 'public-sandbox-test-token';

// 4. Exchange public token
const exchangeResponse = await request(app)
  .post('/plaid/exchange-token')
  .set('Authorization', `Bearer ${authToken}`)
  .send({ publicToken })
  .expect(201);

expect(exchangeResponse.body.accounts.length).toBeGreaterThan(0);

// 5. Verify database state
const connection = await prisma.bankConnection.findFirst({
  where: { userId: user.id },
  include: { accounts: true },
});

expect(connection).not.toBeNull();
```

---

## Test Database Setup

### Using Docker Compose

```bash
# Start test database
docker compose up -d postgres

# Run migrations
npx prisma migrate dev

# Clean database between tests (automatic in test helpers)
```

### Manual Database Cleanup

```typescript
import { cleanDatabase } from './helpers/test-app.helper';

// In test
beforeEach(async () => {
  await cleanDatabase(prisma);
});
```

---

## Environment Variables for Testing

Create `.env.test` file:

```bash
# Database
DATABASE_URL="postgresql://rest:rest123@localhost:5432/rest_treasury_test?schema=public"

# Encryption
ENCRYPTION_KEY="your-32-byte-encryption-key-here"

# JWT
JWT_SECRET="test-jwt-secret"

# Plaid (sandbox)
PLAID_CLIENT_ID="your_sandbox_client_id"
PLAID_SECRET="your_sandbox_secret"
PLAID_ENV="sandbox"

# Skip E2E tests if no Plaid credentials
SKIP_PLAID_E2E=false
```

---

## Running All Tests

```bash
# Unit tests only (fast)
npm test

# Integration tests (requires DB)
npm run test:integration

# E2E tests (requires DB + Plaid credentials)
npm run test:e2e

# All tests
npm run test:all

# Watch mode (unit tests only)
npm test -- --watch
```

---

## Test Coverage

```bash
# Generate coverage report
npm test -- --coverage

# Open coverage report
open coverage/lcov-report/index.html
```

**Current coverage:**
- **Unit tests**: 231 tests passing
- **Integration tests**: 9 tests (database operations)
- **E2E tests**: 7 tests (HTTP API + Plaid sandbox)
- **Total**: 247 tests

---

## Debugging Tests

### View logs during test execution

```bash
# Set LOG_LEVEL in .env.test
LOG_LEVEL=debug npm test
```

### Debug specific test in VSCode

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Current File",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": [
    "${fileBasename}",
    "--config",
    "jest.config.js"
  ],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Common Issues

**Issue**: Tests timeout after 5 seconds
**Fix**: Add timeout to slow tests:
```typescript
it('should retry network errors', async () => {
  // test code
}, 20000); // 20 second timeout
```

**Issue**: Database connection errors
**Fix**: Ensure PostgreSQL is running:
```bash
docker compose up -d postgres
```

**Issue**: Plaid API errors in E2E tests
**Fix**: Verify credentials are correct in `.env.test`

---

## Test Best Practices (from CLAUDE.md)

✅ **DO:**
- Test edge cases (null values, empty arrays, race conditions)
- Test security vulnerabilities (cross-user access, auth bypass)
- Test error handling (network failures, database errors)
- Test data integrity (balance conversion, transaction rollbacks)
- Use descriptive test names that explain the scenario

❌ **DON'T:**
- Write vanity tests (100% coverage with no value)
- Test framework code (e.g., testing that Prisma works)
- Duplicate test scenarios
- Skip error cases
- Use `console.log` in tests (use assertions)

---

## CI/CD Integration

For GitHub Actions:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: rest
          POSTGRES_PASSWORD: rest123
          POSTGRES_DB: rest_treasury_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npx prisma migrate dev
      - run: npm test -- --coverage
      - run: npm run test:integration

      # E2E tests with Plaid (only if secrets available)
      - name: E2E Tests
        if: env.PLAID_CLIENT_ID != ''
        env:
          PLAID_CLIENT_ID: ${{ secrets.PLAID_CLIENT_ID }}
          PLAID_SECRET: ${{ secrets.PLAID_SECRET }}
        run: npm run test:e2e
```

---

## Next Steps

- [ ] Add more integration tests for concurrent operations
- [ ] Add E2E tests for complete investment flow (Phase 5)
- [ ] Add performance tests (load testing with k6)
- [ ] Add mutation testing (Stryker)
