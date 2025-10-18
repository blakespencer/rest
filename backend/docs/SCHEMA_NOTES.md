# Prisma Schema - API Alignment Notes

## Plaid API → Prisma Schema Mapping

### BankConnection Model
Stores Plaid Item data:

| Plaid API Field | Prisma Field | Notes |
|----------------|--------------|-------|
| `access_token` | `accessToken` | ✅ **ENCRYPTED** at application level |
| `item_id` | `itemId` | ✅ Unique identifier |
| `institution_id` | `institutionId` | ✅ Plaid institution ID |
| N/A | `institutionName` | Fetched via `/institutions/get_by_id` |
| N/A | `status` | Our tracking: ACTIVE/DISCONNECTED/ERROR |

### BankAccount Model
Stores Plaid Account data from `/accounts/get`:

| Plaid API Field | Prisma Field | Notes |
|----------------|--------------|-------|
| `account_id` | `plaidAccountId` | ✅ Unique Plaid account ID |
| `name` | `name` | ✅ Account name |
| `official_name` | `officialName` | ✅ Optional official name |
| `type` | `type` | ✅ depository, credit, loan, investment |
| `subtype` | `subtype` | ✅ checking, savings, credit card, etc. |
| `mask` | `mask` | ✅ Last 4 digits (e.g., "1234") |
| `balances.current` | `currentBalance` | ✅ **Stored in CENTS** (x100) |
| `balances.available` | `availableBalance` | ✅ **Stored in CENTS** (x100) |
| `balances.iso_currency_code` | `isoCurrencyCode` | ✅ Usually "USD" |

**Why cents?** Avoids floating-point precision errors in financial calculations.

### Transaction Model
Stores Plaid Transaction data from `/transactions/get`:

| Plaid API Field | Prisma Field | Notes |
|----------------|--------------|-------|
| `transaction_id` | `plaidTransactionId` | ✅ Unique transaction ID |
| `name` | `name` | ✅ Merchant/description |
| `amount` | `amount` | ✅ **In CENTS**. Positive = debit, Negative = credit |
| `iso_currency_code` | `isoCurrencyCode` | ✅ Currency |
| `date` | `date` | ✅ Transaction date |
| `pending` | `pending` | ✅ Boolean |
| `category` | `category` | ✅ Array (e.g., ["Food", "Restaurants"]) |
| `payment_channel` | `paymentChannel` | ✅ online, in store, other |
| `merchant_name` | `merchantName` | ✅ Optional merchant |
| `location` | `location` | ✅ JSON: {city, region, postal_code, lat, lon} |

**Fields NOT stored (for MVP simplicity):**
- `authorized_date` - authorization date
- `category_id` - Plaid category ID
- `personal_finance_category` - new granular categories
- `transaction_type` - place/special/unresolved
- `payment_meta` - check numbers, etc.

*Can add these later if needed.*

---

## Mock Seccl → Prisma Schema Mapping

**⚠️ MVP DECISION: Using Mock Seccl Service**

For the MVP, we're using `USE_MOCK_SECCL=true` with a **simplified schema**.

**Why Mock?**
- Real Seccl requires full KYC (name, address, DOB, nationality, bank details)
- Requires creating "Seccl Client" separate from app User
- Requires managing asset universe (add assets before trading)
- 2-step process: payment instruction + order expectation
- Complex for 2-hour MVP scope

**Real Seccl Integration (Production):**
Would require additional models:
- `SecclClient` - KYC data, firmId, secclClientId
- `SecclAsset` - Asset universe (funds available to trade)
- `PaymentInstruction` - Cash movement tracking
- More complex order states

**For now:** Simple mock with basic order tracking.

### InvestmentOrder Model (Simplified Mock)
Mock order placement:

| Seccl API Field | Prisma Field | Notes |
|-----------------|--------------|-------|
| `order_id` | `externalOrderId` | ✅ Seccl's order ID |
| `fund_id` | `fundId` | ✅ Money market fund identifier |
| `amount` | `amount` | ✅ **In CENTS** |
| `currency` | `currency` | ✅ USD |
| `status` | `status` | ✅ PENDING/SUBMITTED/FILLED/FAILED |
| N/A | `idempotencyKey` | ✅ **CRITICAL** - prevents duplicate orders |
| `filled_at` | `filledAt` | ✅ Execution timestamp |
| `filled_amount` | `filledAmount` | ✅ Actual filled amount (may differ) |

**Idempotency Key:**
- Required for ALL financial mutations
- Unique constraint in database
- Prevents duplicate orders on retry

### InvestmentPosition Model
Maps to Seccl holdings/positions:

| Seccl API Field | Prisma Field | Notes |
|-----------------|--------------|-------|
| `fund_id` | `fundId` | ✅ Fund identifier |
| `fund_name` | `fundName` | ✅ Human-readable name |
| `quantity` | `quantity` | ✅ Shares held |
| `current_value` | `currentValue` | ✅ **In CENTS** |
| `cost_basis` | `costBasis` | ✅ **In CENTS** - original cost |
| `currency` | `currency` | ✅ USD |

---

## Schema Design Decisions

### ✅ Money Stored as Integers (Cents)
**Why:** Avoids floating-point precision errors
```typescript
// BAD
amount: 10.50 // Could become 10.499999999

// GOOD
amount: 1050 // Always precise (10.50 * 100)
```

### ✅ UUIDs for Primary Keys
**Why:**
- Non-sequential (security)
- Globally unique
- Can be generated client-side

### ✅ Soft Deletes
**Why:**
- Audit compliance (never truly delete financial data)
- Can restore accidentally deleted connections

### ✅ Timestamps on Everything
- `createdAt` - when record was created
- `updatedAt` - when record was last modified
- Critical for audit trails

### ✅ Idempotency Keys
**CRITICAL for financial operations:**
- Prevents duplicate charges/orders
- Unique constraint enforced at database level
- 24-hour TTL recommended (not in schema, handled in application)

---

## Data Integrity Constraints

### Unique Constraints
- `User.email` - one email per user
- `BankConnection.itemId` - one Plaid item per connection
- `BankAccount.plaidAccountId` - one account per Plaid account
- `Transaction.plaidTransactionId` - prevent duplicate transactions
- `InvestmentOrder.idempotencyKey` - prevent duplicate orders

### Cascade Deletes
- Delete user → deletes all connections, orders, audit logs
- Delete bank connection → deletes all accounts, transactions
- Delete bank account → deletes all transactions

**Why:** Maintains referential integrity

---

## Security Considerations

### Encrypted Fields
- `BankConnection.accessToken` - **MUST be encrypted** before storing
  - Use AES-256 encryption
  - Encryption happens at application level (not database level)
  - Never log unencrypted tokens

### Masked Data
- `BankAccount.mask` - only store last 4 digits (e.g., "1234")
- NEVER store full account numbers

### Audit Logging
Every financial mutation logged in `AuditLog`:
- Who (userId)
- What (action + resourceType)
- When (createdAt)
- Where (ipAddress)
- How (metadata JSON)

---

## Future Enhancements (Not in MVP)

### Plaid
- [ ] Add `authorized_date` for transactions
- [ ] Add `personal_finance_category` for better categorization
- [ ] Add `transaction_type` field
- [ ] Store Plaid webhook events

### Real Seccl Integration (Beyond Mock)
- [ ] Add `SecclClient` model for KYC data
- [ ] Add `SecclAsset` model for asset universe
- [ ] Add `PaymentInstruction` model for cash movements
- [ ] Add `SecclAccount` model (GIA, ISA, SIPP, etc.)
- [ ] Add fee tracking
- [ ] Add dividend/distribution tracking
- [ ] Add performance calculations (IRR, TWR)
- [ ] Handle GBP currency (Seccl is UK-focused)

### General
- [ ] Add job queue table (for async sync)
- [ ] Add webhook delivery table
- [ ] Add rate limiting table

---

**Last Updated:** 2025-10-18
