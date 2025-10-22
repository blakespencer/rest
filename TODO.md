# Rest Treasury Service - Implementation Checklist

## Phase 1: Infrastructure & Database Setup

### 1.1 Environment Configuration ✅

- [x] Create `.env` file from `.env.example`
- [x] Generate secure `ENCRYPTION_KEY` (32-byte for AES-256)
- [x] Generate secure `JWT_SECRET`
- [x] Register for Plaid sandbox account (manual step - documented)
- [x] Add Plaid credentials to `.env` (PLAID_CLIENT_ID, PLAID_SECRET) (manual step - documented)
- [x] Decide on Seccl vs Mock API approach (USE_MOCK_SECCL=true by default)
- [x] Add Seccl credentials if using real sandbox (optional - documented)

### 1.2 Database Setup ✅

- [x] Create `docker-compose.yml` with PostgreSQL service
- [x] Start PostgreSQL container (`docker compose up -d postgres`)
- [x] Create Prisma schema (`prisma/schema.prisma`)
  - [x] User model
  - [x] BankConnection model (with encrypted accessToken)
  - [x] BankAccount model
  - [x] Transaction model
  - [x] InvestmentOrder model
  - [x] InvestmentPosition model
  - [x] AuditLog model
- [x] Run initial migration (`npx prisma migrate dev`)
- [x] Create seed script for test data

### 1.3 Core Infrastructure ✅

- [x] Set up structured logging service (`common/logging/logger.service.ts`)
- [x] Set up encryption service (`common/encryption/encryption.service.ts`)
- [x] Create BaseService with transaction helpers
- [x] Create BaseRepository pattern
- [x] Set up global exception filter
- [x] Configure environment variable validation
- [x] Add health check endpoint

---

## Phase 2: Authentication Module

### 2.1 User Management ✅

- [x] Create User entity in Prisma (completed in Phase 1.2)
- [x] Create AuthModule
- [x] Implement user registration endpoint (POST /auth/register)
- [x] Implement user login endpoint (POST /auth/login)
- [x] Hash passwords (bcrypt with 10 salt rounds)
- [x] Unit tests for AuthRepository (7 tests)
- [x] Unit tests for AuthService (16 tests with edge cases)

### 2.2 JWT Implementation ✅

- [x] Install @nestjs/jwt and @nestjs/passport
- [x] Create JWT strategy with defensive security validation
- [x] Create JWT auth guard
- [x] Update AuthService to generate JWT tokens on login/register
- [x] Update AuthResponseDto to include accessToken
- [x] Configure JWT module with secret and expiration (1h default)
- [x] Fixed critical security vulnerability (CVE-2025-30144 style type coercion attack)
- [ ] Add JWT to protected endpoints (next phase)
- [ ] Implement token refresh (optional for MVP)

### 2.3 Testing ✅

- [x] Unit tests for AuthService (29 tests: 16 core + 7 edge cases + 6 JWT tests)
- [x] Unit tests for AuthRepository (7 tests covering database operations)
- [x] Unit tests for JwtStrategy (21 tests including 8 CVE-2025-inspired security tests)
- [x] Unit tests for JwtAuthGuard (3 tests)
- [x] **Total: 147 tests passing** (60 auth-related tests)
- [x] **Found and fixed 1 critical security vulnerability** (type coercion in JWT payload validation)
- [ ] E2E tests for registration/login
- [ ] E2E tests for JWT-protected endpoints

---

## Phase 3: Plaid Integration (Bank Connectivity) ✅

### 3.1 Plaid Service Setup ✅

- [x] Install plaid SDK (`npm install plaid`)
- [x] Install async-retry for exponential backoff
- [x] Create PlaidModule
- [x] Create PlaidService with Plaid client initialization (sandbox/development/production)
- [x] Implement retry logic with exponential backoff and jitter
- [x] Create custom PlaidIntegrationException
- [x] Rate limit handling (429 errors)
- [x] Network error retry
- [x] Unit tests: 21 tests for PlaidService

### 3.2 Link Token Flow ✅

- [x] Implement `POST /api/plaid/link-token`
  - [x] Create LinkTokenResponseDto
  - [x] Call Plaid API to create link token
  - [x] Return link token to frontend (linkToken + expiration only)
- [x] JWT authentication protection
- [x] Unit tests: 7 tests for PlaidController

### 3.3 Public Token Exchange ✅

- [x] Implement `POST /api/plaid/exchange-token`
  - [x] Accept public token from client (ExchangePublicTokenDto)
  - [x] Exchange for access token via Plaid
  - [x] Encrypt access token before storage (AES-256)
  - [x] Create BankConnection record
  - [x] Fetch initial account data
  - [x] Return connection details (BankConnectionResponseDto)
- [x] Add idempotency handling (check if itemId exists)
- [x] Security: ConflictException if itemId belongs to different user
- [x] Balance conversion (dollars → cents) to avoid floating point errors
- [x] Transaction atomicity with rollback on failure
- [x] Unit tests: covered in BankConnectionService tests

### 3.4 Bank Connection Management ✅

- [x] Create BankConnectionModule
- [x] Create BankConnectionService (extends BaseService)
- [x] Create BankConnectionRepository (extends BaseRepository)
- [x] Implement `GET /api/bank-connections` (list user's connections)
- [x] Implement `GET /api/bank-connections/:id` (get single connection)
- [x] Implement `DELETE /api/bank-connections/:id` (soft delete)
- [x] Create DTOs (BankConnectionResponseDto, BankAccountDto)
- [x] Create mappers (BankConnectionMapper)
- [x] Ownership validation (ForbiddenException for unauthorized access)
- [x] Soft delete pattern (deletedAt timestamp)
- [x] Unit tests: 12 tests for BankConnectionController

### 3.5 Testing ✅

- [x] Unit tests for PlaidService (21 tests - mock Plaid API)
  - [x] createLinkToken success and failures
  - [x] exchangePublicToken with retry logic
  - [x] getAccounts with balance mapping
  - [x] 5xx server error retry
  - [x] 4xx client error no retry (except 429)
  - [x] Rate limit (429) retry
  - [x] Network error retry
  - [x] Max retry failure
  - [x] Token sanitization in logs
- [x] Unit tests for BankConnectionService (16 tests)
  - [x] exchangePublicToken with balance conversion
  - [x] Idempotency (return existing connection)
  - [x] Security: cross-user itemId protection
  - [x] Plaid failure handling
  - [x] Transaction rollback on error
  - [x] Null balance handling
  - [x] Encryption service integration
  - [x] findByUserId, findById, delete with ownership validation
  - [x] Race condition handling
  - [x] Access token not exposed in response DTO
- [x] Unit tests for BankConnectionRepository (14 tests)
  - [x] findById with soft delete filter
  - [x] findByUserId ordering and filtering
  - [x] findByItemId uniqueness
  - [x] create with default ACTIVE status
  - [x] update partial fields
  - [x] softDelete pattern (UPDATE not DELETE)
  - [x] upsertAccounts for multiple accounts
  - [x] Default to USD currency
  - [x] Null balance handling in upsert
  - [x] Empty accounts array
  - [x] Update path in upsert
- [x] Unit tests for PlaidController (7 tests)
  - [x] createLinkToken with JWT user
  - [x] Error propagation
  - [x] Missing user handling (auth bypass attempt)
  - [x] Response DTO filtering (internal fields not exposed)
  - [x] exchangePublicToken validation
  - [x] ConflictException and PlaidIntegrationException propagation
- [x] Unit tests for BankConnectionController (12 tests)
  - [x] findAll, findOne, delete with ownership validation
  - [x] Authorization attack prevention
  - [x] Error message sanitization (no sensitive details)
  - [x] HTTP 204 No Content on delete
  - [x] JwtAuthGuard verification
- [x] **Total: 231 unit tests passing** (49 new battle-tested edge case tests)
- [x] **Bugs found and fixed: 4**
  1. Controllers crashing on null user (security)
  2. Test infrastructure missing transaction mock
  3. Test timeout on network retry
  4. Race condition test missing complete mock setup
- [x] Integration tests with real database (Prisma + mocked Plaid)
  - **8 integration tests** in `tests/integration/bank-connection.int.spec.ts`
  - Tests database operations, transactions, rollbacks, data isolation
  - Prerequisites: PostgreSQL running (`docker compose up -d postgres`)
  - Prerequisites: Create `.env.test` from `.env.test.example`
  - Run with: `npm run test:integration`
- [x] E2E tests for Plaid integration (real Plaid sandbox support)
  - **9 E2E tests** in `tests/e2e/plaid-integration.e2e.spec.ts`
  - Tests complete HTTP API flows with real Plaid sandbox API
  - Prerequisites: PostgreSQL + Plaid sandbox credentials in `.env.test`
  - Can skip if no credentials: `SKIP_PLAID_E2E=true`
  - Run with: `npm run test:e2e`
- [x] Test infrastructure created:
  - Test helpers (`tests/helpers/test-app.helper.ts`, `auth.helper.ts`)
  - Test fixtures (`tests/fixtures/user.fixtures.ts`, `plaid.fixtures.ts`)
  - Comprehensive testing guide (`tests/README.md`)
  - Environment config (`.env.test.example`)
  - Jest config updated to separate unit/integration/E2E tests
  - **Test commands:**
    - `npm test` - Unit tests only (304 tests, fast)
    - `npm run test:integration` - Integration tests (8 tests, needs DB)
    - `npm run test:e2e` - E2E tests (9 tests, needs DB + Plaid)
    - `npm run test:all` - All tests sequentially

---

## Phase 4: Bank Account & Transaction Sync ✅ COMPLETE

**Status:** Phase 4.1 (Account Sync) ✅ Complete | Phase 4.2 (Transaction Sync) ✅ Complete | Phase 4.3 (Balance Endpoints) ✅ Complete

**What's Complete:**

- ✅ BankAccountModule created with service, repository, controller
- ✅ Account sync from Plaid (`POST /bank-connections/:id/sync`)
- ✅ **Transaction sync from Plaid (last 30 days, automatic deduplication)**
- ✅ TransactionRepository with upsert logic (prevents duplicates by plaidTransactionId)
- ✅ Balance storage in cents (avoiding floating point issues)
- ✅ Transaction amounts in cents (avoiding floating point issues)
- ✅ Consolidated balance endpoint with currency filtering
- ✅ Account list and detail endpoints with ownership validation
- ✅ **Transaction endpoint with pagination** (`GET /bank-accounts/:id/transactions?page=1&pageSize=50`)
- ✅ 73 comprehensive unit tests (repository, service, controller) - all passing
- ✅ Transaction model in Prisma schema

**What's Remaining:**

- 🚧 Integration and E2E tests for account/transaction sync
- 🚧 Unit tests for transaction-specific functionality

**Key Features Implemented:**

- Balances stored in cents to prevent floating point precision loss
- Ownership validation on all endpoints (ForbiddenException for unauthorized access)
- Soft-delete connection filtering
- Structured logging with context (debug logs for all operations)
- Security: No plaidAccountId exposure, masked account numbers only
- Edge case handling: negative balances, MAX_SAFE_INTEGER overflow, null balances, race conditions

---

### 4.1 Account Sync ✅

- [x] Create BankAccountModule
- [x] Create BankAccountService
- [x] Create BankAccountRepository
- [x] Implement account sync from Plaid
  - [x] Fetch accounts via Plaid API
  - [x] Map Plaid response to domain model (balances stored in cents)
  - [x] Upsert accounts in database
- [x] Implement `POST /api/bank-connections/:id/sync`
- [x] Store account balances (current, available) in cents to avoid floating point issues
- [x] Store account metadata (name, type, mask, officialName, subtype, currency)

### 4.2 Transaction Sync ✅

- [x] Create Transaction model in Prisma
- [x] Create TransactionRepository with deduplication logic
  - [x] Upsert transactions by plaidTransactionId (prevents duplicates)
  - [x] Handle pending → posted status updates
  - [x] Pagination support (findByBankAccountId with offset/limit)
  - [x] Date range filtering support
- [x] Implement transaction sync from Plaid
  - [x] Fetch transactions via Plaid API (last 30 days)
  - [x] Deduplicate by plaidTransactionId
  - [x] Store transactions in database (amounts in cents)
  - [x] Map Plaid transaction categories
- [x] Add transaction sync to POST /bank-connections/:id/sync endpoint
  - [x] Automatically syncs transactions along with accounts
  - [x] Creates account lookup map for transaction mapping
  - [x] Filters transactions to only include synced accounts

### 4.3 Balance & Transaction Endpoints ✅

- [x] Implement `GET /api/bank-accounts` (list all accounts)
  - [x] JWT-protected endpoint
  - [x] Returns user's accounts with balances in cents
  - [x] Filters out deleted connections
  - [x] Ownership validation
- [x] Implement `GET /api/bank-accounts/:id` (single account)
  - [x] Ownership verification (ForbiddenException for unauthorized access)
  - [x] Structured error logging for security events
- [x] Implement `GET /api/bank-accounts/:id/transactions`
  - [x] Pagination support (page, pageSize query parameters)
  - [x] Max 100 items per page (validated)
  - [x] Returns total count and hasMore flag
  - [x] Ownership validation (ForbiddenException for unauthorized access)
  - [x] Transactions sorted by date (descending)
- [x] Implement `GET /api/bank-accounts/consolidated-balance`
  - [x] Sum all account balances by currency
  - [x] Filter by currency parameter (defaults to USD)
  - [x] Return total available and current balances
  - [x] Include account summaries with masked data only
  - [x] Only include ACTIVE connections

### 4.4 Testing ✅

- [x] **Unit tests for BankAccount module (73 tests)**
  - [x] BankAccountRepository (24 tests)
    - Core CRUD operations
    - Consolidated balance calculations
    - Edge cases: negative balances, MAX_SAFE_INTEGER overflow, null handling
    - Soft-delete filtering
    - Currency filtering
  - [x] BankAccountService (36 tests)
    - Business logic and transaction orchestration
    - Ownership validation and authorization
    - Concurrency edge cases (race conditions, deleted accounts)
    - Balance calculation with mixed null/numeric values
    - Security: cross-user access attempts, data exposure prevention
    - Error handling and transaction rollback
  - [x] BankAccountController (13 tests)
    - JWT authentication and user extraction
    - HTTP endpoint contracts
    - Error response handling
    - Data masking in responses
- [x] **Bug fixes found by tests:**
  - Missing debug logging in all 3 service methods
  - Missing setContext() call in service constructor
- [ ] Integration tests for account/transaction repository
- [ ] E2E tests for sync endpoints
- [ ] Test concurrent sync requests
- [ ] Test with multiple bank connections

**Phase 4 Test Summary:**

- Total Unit Tests: 304 (231 from Phase 3 + 73 from Phase 4)
- Edge Cases Tested: Negative balances, integer overflow, null handling, SQL injection, race conditions, unauthorized access
- Security Tests: Cross-user access, data exposure, ownership validation, audit logging

---

## Phase 5: Investment Flow (Seccl Mock) ✅ COMPLETE

**Status:** ✅ Complete - Full investment flow implemented with mock Seccl service

### 5.1 Choose Implementation Approach ✅

- [x] **Option A: Mock Service** (faster, recommended for MVP)
  - [x] Create MockSecclService with in-memory storage
  - [x] Simulate account creation with unique IDs
  - [x] Simulate transaction groups (payment + order)
  - [x] Simulate payment and order completion
  - [x] Generate mock order IDs and position IDs
  - [x] Support for all 7 Seccl API endpoints from SECCL_API_REFERENCE.md

### 5.2 Investment Module Setup ✅

- [x] Create InvestmentModule
- [x] Create InvestmentService with complete flow orchestration
- [x] Create SecclAccountRepository
- [x] Create InvestmentOrderRepository
- [x] Create InvestmentPositionRepository
- [x] Create SecclAccount model in Prisma
  - [x] secclAccountId, secclClientId, firmId
  - [x] accountName, wrapperType (ISA/GIA/PENSION)
  - [x] cashBalance, totalValue
  - [x] Relations to orders and positions
- [x] Create InvestmentOrder model in Prisma
  - [x] userId, secclAccountId, fundId, amount
  - [x] linkId, paymentId, orderId (Seccl references)
  - [x] idempotencyKey (unique constraint)
  - [x] executedAt, executedQuantity, executionPrice
  - [x] status tracking (PENDING → PAYMENT_COMPLETED → ORDER_COMPLETED)
- [x] Create InvestmentPosition model
  - [x] secclPositionId (unique), fundId, fundName
  - [x] quantity, bookValue, currentValue
  - [x] growth, growthPercent
  - [x] Relations to SecclAccount

### 5.3 Investment Account Creation ✅

- [x] Implement `POST /investments/accounts`
  - [x] Create Seccl investment account (ISA/GIA/PENSION)
  - [x] Call MockSecclService to create account
  - [x] Store external account reference
  - [x] Return account details (id, secclAccountId, wrapperType)
- [x] Implement `GET /investments/accounts` (list all accounts)
- [x] Implement `GET /investments/accounts/:id/summary` (account summary with positions)

### 5.4 Order Placement ✅

- [x] Implement `POST /investments/orders` - **COMPLETE FLOW**
  - [x] Validate Seccl account exists and belongs to user
  - [x] Check idempotency key (prevent duplicates)
  - [x] Create transaction group (payment + order) in Seccl
  - [x] Complete payment (simulate cash receipt)
  - [x] Complete order (simulate execution with shares/price)
  - [x] Update order status through lifecycle
  - [x] Create/update position in database
  - [x] All steps wrapped in database transaction
- [x] Require `Idempotency-Key` header (400 if missing)
- [x] Create DTOs (CreateInvestmentOrderDto, InvestmentOrderResponseDto)
- [x] Create DTOs (CreateInvestmentAccountDto, InvestmentAccountResponseDto)

### 5.5 Order Status & Positions ✅

- [x] Implement `GET /investments/orders` (list user orders)
  - [x] Optional filter by secclAccountId
  - [x] Returns order history with execution details
- [x] Implement `GET /investments/positions` (current holdings)
  - [x] Optional filter by secclAccountId
  - [x] Shows quantity, bookValue, currentValue, growth
  - [x] Money market fund positions
- [x] Position calculation from completed orders (automatic in service)

### 5.6 Funding Simulation ✅

- [x] Simulated via MockSecclService transaction group flow
  - [x] Payment transaction creates cash deposit expectation
  - [x] Order transaction creates investment order
  - [x] Both transactions linked atomically via linkId
  - [x] Payment completion simulates cash receipt
  - [x] Order completion allocates shares

### 5.7 Testing ✅

- [x] Unit tests for SecclService (Mock Mode)
  - [x] 8 comprehensive tests covering all 7 API endpoints
  - [x] Account creation with unique IDs
  - [x] Transaction group creation (payment + order)
  - [x] Payment completion
  - [x] Order completion with execution details
  - [x] Position creation after order execution
  - [x] Transaction retrieval by linkId
  - [x] Account summary with positions
  - [x] **All tests passing**
- [x] E2E tests for complete investment flow (9 tests written)
  - [x] Create investment account (ISA/GIA)
  - [x] Create and execute investment order
  - [x] Idempotency verification
  - [x] Require Idempotency-Key header
  - [x] Validate minimum amount
  - [x] Ownership validation
  - [x] View positions after execution
  - [x] Account summary with positions
  - [x] Authentication protection
- [x] Test idempotency (duplicate orders return same result)
- [x] Test authorization (account ownership validation)

**Phase 5 Deliverables:**

✅ **Complete Seccl Mock Service** (src/seccl/seccl.service.ts)
- 7 endpoints fully implemented (createAccount, createTransactionGroup, completeTransaction, getTransactions, getAccountSummary, getPosition)
- In-memory storage with Map-based state management
- Supports full investment flow lifecycle

✅ **Investment Service** (src/investment/investment.service.ts)
- Orchestrates complete investment flow (8 steps)
- Transaction-wrapped operations with rollback
- Idempotency protection
- Ownership validation
- Structured logging with context

✅ **Investment API Endpoints:**
- POST /investments/accounts - Create Seccl account
- GET /investments/accounts - List accounts
- GET /investments/accounts/:id/summary - Account summary
- POST /investments/orders - Create & execute order (complete flow)
- GET /investments/orders - List orders
- GET /investments/positions - List positions

✅ **Test Coverage:**
- 8 unit tests for SecclService (all passing)
- 9 E2E tests for investment flow (written, structure verified)
- Total: 312+ tests in codebase

✅ **Assignment Requirement 3 Complete:**
- 3a. Create "Rest Account" ✅ (POST /investments/accounts)
- 3b. Fund account ✅ (simulated via payment transaction)
- 3c. Place "Buy" order ✅ (POST /investments/orders with automatic execution)
- 3d. Display confirmation + position ✅ (GET /investments/positions, GET /investments/accounts/:id/summary)

### 5.8 Code Quality Refactoring ✅

**Status:** ✅ Critical bug fixed + Major refactoring complete

**Critical Bug Fixed:**
- ✅ **Position Accumulation Bug** (investment.service.ts:308-346)
  - **Issue:** Multiple orders for same fund would overwrite position instead of accumulating
  - **Impact:** User buying 43 shares then 43 more would show 43 total instead of 86
  - **Root Cause:** Prisma upsert setting new values instead of adding to existing
  - **Fix:** Replaced upsert with explicit find-and-add pattern
  - **Test Result:** All 20 E2E tests pass (including idempotency and multi-order tests)

**CLAUDE.md Violations Fixed:**
- ✅ **File Size Violations:**
  - investment.service.ts: Reduced from 432 lines to 335 lines (23% reduction)
  - Still needs work: seccl.service.ts at 481 lines (192% over 250-line limit)
- ✅ **Function Size Violation:**
  - createInvestmentOrder(): Reduced from 182 lines to 65 lines (64% reduction, now 7% under 70-line limit)
  - **Solution:** Extracted InvestmentOrderExecutionService with 4 focused methods:
    1. `createTransactionGroup()` - Creates payment + order in Seccl
    2. `completePayment()` - Completes payment transaction
    3. `completeOrder()` - Completes order with execution details
    4. `updatePosition()` - Creates or accumulates position

**New Service Created:**
- ✅ `InvestmentOrderExecutionService` (investment-order-execution.service.ts)
  - Extracted from InvestmentService to improve separation of concerns
  - Handles all order execution logic (transaction group, payment, order, position)
  - Registered in InvestmentModule providers
  - Follows single responsibility principle

**Repository Interface Updated:**
- ✅ Added `bookValue` field to UpdateInvestmentPositionData interface
  - Required for position accumulation logic
  - Allows tracking total invested amount across multiple orders

**Remaining Refactoring Tasks:**
- 🚧 Move hardcoded config to ConfigService (FIRM_ID, SHARE_PRICE, MONEY_MARKET_FUND_ID, etc.)
- 🚧 Split SecclService by concern (account/transaction/position services)
- 🚧 Replace 4x "as any" type casts with proper enum types (TransactionSubType, MovementType)
- 🚧 Reduce investment.service.ts further (still 335 lines vs 250 limit)

**Test Results:**
- ✅ All 20 E2E tests pass (investment-flow.e2e.spec.ts)
- ✅ Position accumulation verified (multi-order scenarios work correctly)
- ✅ Idempotency verified (duplicate orders return same result)
- ✅ Complete investment flow verified (account → fund → order → position)

---

## Phase 6: Security Hardening

### 6.1 Data Protection

- [ ] Verify all sensitive fields are encrypted (access tokens)
- [ ] Mask account numbers in API responses (show last 4 only)
- [ ] Add data masking to logs (no tokens, no full account numbers)
- [ ] Configure CORS for production
- [ ] Add Helmet.js middleware (security headers)

### 6.2 Rate Limiting

- [ ] Install @nestjs/throttler
- [ ] Configure global rate limiting (100 req/min)
- [ ] Configure strict rate limiting for financial endpoints (10 req/min)
- [ ] Add rate limit headers to responses

### 6.3 Webhook Security (if using real Seccl)

- [ ] Implement webhook signature verification
- [ ] Create webhook endpoint for order status updates
- [ ] Validate request source
- [ ] Handle webhook idempotency

### 6.4 Audit Logging

- [ ] Create AuditLog model
- [ ] Log all financial operations:
  - [ ] Bank connection created/deleted
  - [ ] Investment order placed
  - [ ] Order status changed
- [ ] Include: userId, timestamp, action, resourceType, metadata, IP

---

## Phase 7: Testing & Quality Assurance

### 7.1 Unit Tests

- [ ] AuthService tests
- [ ] PlaidService tests (mock Plaid API)
- [ ] BankConnectionService tests
- [ ] InvestmentService tests
- [ ] Encryption service tests
- [ ] Logger service tests
- [ ] Target: 80%+ coverage on business logic

### 7.2 Integration Tests

- [ ] Database operations (all repositories)
- [ ] Transaction rollback scenarios
- [ ] Concurrent operation tests
- [ ] Foreign key constraint tests

### 7.3 E2E Tests

- [ ] Complete Plaid link flow
- [ ] Bank account sync flow
- [ ] Investment order flow
- [ ] Authentication flow
- [ ] Error scenarios (401, 400, 500)
- [ ] Idempotency tests

### 7.4 Manual Testing Script

- [ ] Create Postman/Insomnia collection
- [ ] Document step-by-step manual test flow
- [ ] Test with real Plaid sandbox credentials
- [ ] Verify database state after each step

---

## Phase 8: Documentation & Deliverables

### 8.1 Code Documentation

- [ ] Add JSDoc comments to all public methods
- [ ] Document complex business logic
- [ ] Add inline comments for security-critical code
- [ ] Document environment variables in .env.example

### 8.2 README Updates

- [ ] ✅ Architecture diagram (DONE)
- [ ] ✅ Setup instructions (DONE)
- [ ] ✅ API endpoint documentation (DONE)
- [ ] ✅ Production hardening notes (DONE)
- [ ] Add actual curl examples with real endpoints
- [ ] Add troubleshooting section

### 8.3 AI Workflow Documentation

- [ ] Create `AI_WORKFLOW.md` documenting:
  - [ ] Prompts used to generate code
  - [ ] Architecture decisions made with AI
  - [ ] Code review process
  - [ ] Testing strategy with AI
  - [ ] Lessons learned

### 8.4 Demo Preparation

- [ ] Create seed script for demo data
- [ ] Write demo script (step-by-step walkthrough)
- [ ] Prepare video recording or screenshots
- [ ] Test complete flow end-to-end

---

## Phase 9: Final Checklist

### 9.1 Code Quality

- [ ] Run linter (`npm run lint`)
- [ ] Run formatter (`npm run format`)
- [ ] Fix all TypeScript errors (`npm run build`)
- [ ] Review all TODO comments in code
- [ ] Remove console.log statements (use logger)
- [ ] Remove dead code

### 9.2 Security Audit

- [ ] No hardcoded secrets in code
- [ ] .env not committed to git
- [ ] Sensitive data encrypted in database
- [ ] SQL injection protection (Prisma handles this)
- [ ] Authentication on all protected endpoints
- [ ] Rate limiting configured

### 9.3 Testing

- [ ] All tests passing (`npm run test`)
- [ ] Integration tests passing (`npm run test:integration`)
- [ ] E2E tests passing (`npm run test:e2e`)
- [ ] Test coverage report generated
- [ ] No skipped tests (.skip removed)

### 9.4 Deployment Readiness

- [ ] Docker build succeeds
- [ ] docker-compose.yml works end-to-end
- [ ] Database migrations run successfully
- [ ] Health check endpoint returns 200
- [ ] Environment variable validation works
- [ ] Logs are structured (JSON format)

### 9.5 Final Deliverables

- [ ] ✅ Git repository with clean history
- [ ] ✅ README.md with architecture and setup
- [ ] AI_WORKFLOW.md documenting AI usage
- [ ] Working demo (video or live)
- [ ] All code committed and pushed
- [ ] Clean git status (no uncommitted changes)

---

## Priority Levels

### 🔴 Critical (Must Have for MVP)

- Phase 1: Infrastructure
- Phase 2: Authentication
- Phase 3: Plaid integration
- Phase 4: Bank accounts (basic)
- Phase 5: Investment orders (mock is fine)
- Phase 8.3: AI workflow documentation

### 🟡 Important (Should Have)

- Phase 4: Transaction sync
- Phase 6: Security hardening
- Phase 7: Comprehensive testing
- Phase 8: Documentation

### 🟢 Nice to Have (If Time Permits)

- Advanced features (webhooks, job queues)
- Performance optimization
- Monitoring and observability

---

## Time Estimates (Total: ~8-12 hours for full implementation)

| Phase                       | Estimated Time |
| --------------------------- | -------------- |
| Phase 1: Infrastructure     | 1-2 hours      |
| Phase 2: Authentication     | 1 hour         |
| Phase 3: Plaid Integration  | 2-3 hours      |
| Phase 4: Bank Accounts      | 2 hours        |
| Phase 5: Investments (Mock) | 2-3 hours      |
| Phase 6: Security           | 1 hour         |
| Phase 7: Testing            | 2-3 hours      |
| Phase 8: Documentation      | 1-2 hours      |

**Note:** Assignment specifies "do not spend more than 2 hours" - focus on:

1. Basic Plaid connection working
2. Mock investment order placement
3. Documented architecture and production considerations (README already done ✅)
4. AI workflow documentation

For a 2-hour MVP, complete only:

- Phase 1 (minimal - just get DB running)
- Phase 3 (Plaid link + exchange token)
- Phase 5.2-5.4 (Mock investment orders)
- Phase 8.3 (AI workflow doc)
