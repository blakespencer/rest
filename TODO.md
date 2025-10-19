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

### 2.2 JWT Implementation
- [ ] Install @nestjs/jwt and @nestjs/passport
- [ ] Create JWT strategy
- [ ] Create JWT auth guard
- [ ] Add JWT to protected endpoints
- [ ] Implement token refresh (optional for MVP)

### 2.3 Testing
- [x] Unit tests for AuthService (16 tests covering security, edge cases, race conditions)
- [x] Unit tests for AuthRepository (7 tests covering database operations)
- [ ] E2E tests for registration/login
- [ ] Test JWT validation

---

## Phase 3: Plaid Integration (Bank Connectivity)

### 3.1 Plaid Service Setup
- [ ] Install plaid SDK (`npm install plaid`)
- [ ] Create PlaidModule
- [ ] Create PlaidService with Plaid client initialization
- [ ] Implement retry logic with exponential backoff
- [ ] Create custom PlaidIntegrationException

### 3.2 Link Token Flow
- [ ] Implement `POST /api/plaid/link-token`
  - [ ] Create link token DTO
  - [ ] Call Plaid API to create link token
  - [ ] Return link token to frontend
- [ ] Add endpoint tests

### 3.3 Public Token Exchange
- [ ] Implement `POST /api/plaid/exchange-token`
  - [ ] Accept public token from client
  - [ ] Exchange for access token via Plaid
  - [ ] Encrypt access token before storage
  - [ ] Create BankConnection record
  - [ ] Fetch initial account data
  - [ ] Return connection details
- [ ] Add idempotency handling (check if itemId exists)
- [ ] Add endpoint tests

### 3.4 Bank Connection Management
- [ ] Create BankConnectionModule
- [ ] Create BankConnectionService
- [ ] Create BankConnectionRepository
- [ ] Implement `GET /api/bank-connections` (list user's connections)
- [ ] Implement `GET /api/bank-connections/:id` (get single connection)
- [ ] Implement `DELETE /api/bank-connections/:id` (soft delete)
- [ ] Create DTOs (CreateConnectionDto, ConnectionResponseDto)
- [ ] Create mappers (domain model → DTO)

### 3.5 Testing
- [ ] Unit tests for PlaidService (mock Plaid API)
- [ ] Unit tests for BankConnectionService
- [ ] Integration tests for BankConnectionRepository
- [ ] E2E tests for complete Plaid link flow
- [ ] Test error scenarios (invalid token, network failure)

---

## Phase 4: Bank Account & Transaction Sync

### 4.1 Account Sync
- [ ] Create BankAccountModule
- [ ] Create BankAccountService
- [ ] Create BankAccountRepository
- [ ] Implement account sync from Plaid
  - [ ] Fetch accounts via Plaid API
  - [ ] Map Plaid response to domain model
  - [ ] Upsert accounts in database
- [ ] Implement `POST /api/bank-connections/:id/sync`
- [ ] Store account balances (current, available)
- [ ] Store account metadata (name, type, mask)

### 4.2 Transaction Sync
- [ ] Create Transaction model in Prisma
- [ ] Implement transaction sync from Plaid
  - [ ] Fetch transactions via Plaid API (last 30 days)
  - [ ] Deduplicate by transaction_id
  - [ ] Store transactions in database
- [ ] Handle transaction updates (pending → posted)

### 4.3 Balance & Transaction Endpoints
- [ ] Implement `GET /api/bank-accounts` (list all accounts)
- [ ] Implement `GET /api/bank-accounts/:id`
- [ ] Implement `GET /api/bank-accounts/:id/transactions`
- [ ] Implement `GET /api/bank-accounts/consolidated-balance`
  - [ ] Sum all account balances
  - [ ] Group by currency
  - [ ] Return total available cash

### 4.4 Testing
- [ ] Unit tests for sync logic
- [ ] Integration tests for account/transaction repository
- [ ] E2E tests for sync endpoints
- [ ] Test concurrent sync requests
- [ ] Test with multiple bank connections

---

## Phase 5: Investment Flow (Seccl or Mock)

### 5.1 Choose Implementation Approach
- [ ] **Option A: Mock Service** (faster, recommended for MVP)
  - [ ] Create MockSecclService
  - [ ] Simulate order placement with random delays
  - [ ] Simulate order status updates
  - [ ] Generate mock order IDs
- [ ] **Option B: Real Seccl Sandbox**
  - [ ] Register for Seccl sandbox account
  - [ ] Install Seccl SDK (if available)
  - [ ] Create SecclService with API client
  - [ ] Implement authentication

### 5.2 Investment Module Setup
- [ ] Create InvestmentModule
- [ ] Create InvestmentService
- [ ] Create InvestmentRepository
- [ ] Create InvestmentOrder model in Prisma
  - [ ] userId, amount, fundId, status
  - [ ] externalOrderId (Seccl reference)
  - [ ] idempotencyKey (unique constraint)
  - [ ] createdAt, updatedAt
- [ ] Create InvestmentPosition model

### 5.3 Investment Account Creation
- [ ] Implement `POST /api/investments/accounts`
  - [ ] Create investment account for user (one-time setup)
  - [ ] Call Seccl/Mock API to create account
  - [ ] Store external account reference
- [ ] Add idempotency protection

### 5.4 Order Placement
- [ ] Implement `POST /api/investments/orders`
  - [ ] Validate user has sufficient balance
  - [ ] Check idempotency key (prevent duplicates)
  - [ ] Create order in database (status: PENDING)
  - [ ] Submit order to Seccl/Mock API
  - [ ] Update order with external reference
  - [ ] Update status to SUBMITTED
  - [ ] Create audit log entry
- [ ] Add rate limiting
- [ ] Require `Idempotency-Key` header
- [ ] Create DTOs (CreateInvestmentOrderDto, OrderResponseDto)

### 5.5 Order Status & Positions
- [ ] Implement `GET /api/investments/orders` (list user orders)
- [ ] Implement `GET /api/investments/orders/:id` (single order)
- [ ] Implement `GET /api/investments/positions` (current holdings)
  - [ ] Calculate positions from filled orders
  - [ ] Show quantity, current value, unrealized P&L (mock)
- [ ] Add order status polling (optional: webhook handler)

### 5.6 Funding Simulation
- [ ] Implement simulated cash sweep from bank account
  - [ ] Create internal transfer record
  - [ ] Update bank account balance (mock)
  - [ ] Update investment account balance
- [ ] Or: assume cash is already in investment account

### 5.7 Testing
- [ ] Unit tests for InvestmentService
- [ ] Unit tests for Seccl/Mock service
- [ ] Integration tests for order placement
- [ ] E2E tests for complete investment flow
- [ ] Test idempotency (duplicate orders)
- [ ] Test insufficient funds scenario
- [ ] Test concurrent order placement

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

| Phase | Estimated Time |
|-------|---------------|
| Phase 1: Infrastructure | 1-2 hours |
| Phase 2: Authentication | 1 hour |
| Phase 3: Plaid Integration | 2-3 hours |
| Phase 4: Bank Accounts | 2 hours |
| Phase 5: Investments (Mock) | 2-3 hours |
| Phase 6: Security | 1 hour |
| Phase 7: Testing | 2-3 hours |
| Phase 8: Documentation | 1-2 hours |

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
