# User Journey - Rest Treasury Service

## Overview

This document describes the complete user journey from registration through investment, showing the current prototype implementation and how it would be enhanced for production with real fund transfers.

---

## Phase 1: Account Setup & Bank Connection

### Step 1: User Registration

**User Action:**
```
User visits registration page
Enters: email, password, name
Clicks "Register"
```

**API Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "john.doe@company.com",
  "password": "SecurePassword123!",
  "name": "John Doe"
}
```

**What Happens:**
1. System validates email format and password strength
2. Password is hashed using bcrypt (10 rounds)
3. User record created in PostgreSQL
4. Response includes user ID and basic profile

**Response:**
```json
{
  "id": "usr_cm2k8f9j0000008l6h7qe9x1a",
  "email": "john.doe@company.com",
  "name": "John Doe",
  "createdAt": "2025-10-21T15:30:00.000Z"
}
```

---

### Step 2: User Login

**User Action:**
```
User enters email and password
Clicks "Login"
```

**API Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john.doe@company.com",
  "password": "SecurePassword123!"
}
```

**What Happens:**
1. System finds user by email
2. Compares password hash using bcrypt
3. Generates JWT token (expires in 1 hour)
4. Returns token and user profile

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "usr_cm2k8f9j0000008l6h7qe9x1a",
    "email": "john.doe@company.com",
    "name": "John Doe"
  }
}
```

**User Experience:**
- Token saved to browser (localStorage/sessionStorage)
- User redirected to dashboard
- All subsequent requests include: `Authorization: Bearer <token>`

---

### Step 3: Create Plaid Link Token

**User Action:**
```
User clicks "Connect Bank Account" button
```

**API Request:**
```http
POST /api/bank-connections/plaid/link-token
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**What Happens:**
1. System extracts user ID from JWT token
2. Calls Plaid API to create Link token
3. Configures for Auth + Transactions products
4. Returns token for frontend Plaid Link initialization

**Response:**
```json
{
  "linkToken": "link-sandbox-af1a0311-da53-4636-b754-dd15cc058176",
  "expiration": "2025-10-21T16:30:00.000Z"
}
```

**User Experience:**
- Plaid Link modal opens
- Beautifully designed UI (provided by Plaid)

---

### Step 4: Complete Plaid Link Flow

**User Action (in Plaid Link modal):**
```
1. Select bank: "First Platypus Bank"
2. Enter credentials:
   - Username: user_good
   - Password: pass_good
   (Sandbox credentials for testing)
3. Select accounts to connect:
   ✓ Plaid Checking ($1,000.00)
   ✓ Plaid Savings ($2,500.00)
4. Click "Continue"
```

**What Happens (Frontend):**
1. Plaid Link authenticates user with bank (sandbox simulation)
2. User selects accounts to share
3. Plaid Link returns `public_token` to frontend
4. Frontend immediately sends public_token to backend

**Flow:**
```
User → Plaid Link Modal → Bank (Sandbox) → Plaid Link
     → Returns public_token → Frontend catches it
```

---

### Step 5: Exchange Public Token

**User Action:**
```
(Automatic - frontend handles this)
Frontend receives public_token from Plaid Link
Immediately sends to backend to exchange
```

**API Request:**
```http
POST /api/bank-connections/plaid/exchange-token
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "publicToken": "public-sandbox-b8e3c04a-6f79-4a33-8c9e-157e0a39e9f1"
}
```

**What Happens (Backend - CRITICAL FLOW):**

```typescript
// 1. Exchange public token for access token
const plaidResponse = await plaidClient.itemPublicTokenExchange({
  public_token: publicToken
});
// Returns: { access_token: "access-sandbox-xxx", item_id: "item-xxx" }

// 2. Encrypt and store access token (SECURITY!)
const encryptedToken = encryptionService.encrypt(plaidResponse.access_token);

// 3. Create bank connection record
const connection = await prisma.bankConnection.create({
  userId: user.id,
  accessToken: encryptedToken,  // NEVER store plaintext!
  itemId: plaidResponse.item_id,
  institutionId: "ins_109508",
  institutionName: "First Platypus Bank",
  status: "ACTIVE"
});

// 4. Fetch bank accounts from Plaid
const accountsResponse = await plaidClient.accountsBalanceGet({
  access_token: plaidResponse.access_token
});

// 5. Store each account in database
for (const account of accountsResponse.accounts) {
  await prisma.bankAccount.create({
    connectionId: connection.id,
    userId: user.id,
    plaidAccountId: account.account_id,
    name: account.name,
    officialName: account.official_name,
    type: account.type,        // "depository"
    subtype: account.subtype,  // "checking", "savings"
    mask: account.mask,        // "0000" (last 4 digits)
    availableBalance: account.balances.available * 100,  // Convert to pence
    currentBalance: account.balances.current * 100,
    currency: account.balances.iso_currency_code  // "USD"
  });
}
```

**Response:**
```json
{
  "id": "conn_cm2k9x1b0000108l6a2b3c4d5",
  "institutionId": "ins_109508",
  "institutionName": "First Platypus Bank",
  "status": "ACTIVE",
  "accounts": [
    {
      "id": "acct_cm2k9y2c0000208l6e3f4g5h6",
      "name": "Plaid Checking",
      "type": "depository",
      "subtype": "checking",
      "mask": "0000",
      "availableBalance": 100000,  // £1,000.00 in pence
      "currentBalance": 110000,
      "currency": "USD"
    },
    {
      "id": "acct_cm2k9z3d0000308l6i4j5k6l7",
      "name": "Plaid Savings",
      "type": "depository",
      "subtype": "savings",
      "mask": "1111",
      "availableBalance": 250000,  // £2,500.00
      "currentBalance": 250000,
      "currency": "USD"
    }
  ],
  "createdAt": "2025-10-21T15:35:00.000Z"
}
```

**User Experience:**
- Plaid Link modal closes
- Dashboard shows: "2 accounts connected - Total: $3,500.00"
- Account details displayed in UI

---

### Step 6: View Connected Accounts

**User Action:**
```
User views dashboard
Sees connected bank accounts
```

**API Request:**
```http
GET /api/bank-accounts
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
[
  {
    "id": "acct_cm2k9y2c0000208l6e3f4g5h6",
    "connectionId": "conn_cm2k9x1b0000108l6a2b3c4d5",
    "name": "Plaid Checking",
    "institutionName": "First Platypus Bank",
    "type": "depository",
    "subtype": "checking",
    "mask": "0000",
    "availableBalance": 100000,
    "currentBalance": 110000,
    "currency": "USD",
    "lastSynced": "2025-10-21T15:35:00.000Z"
  },
  {
    "id": "acct_cm2k9z3d0000308l6i4j5k6l7",
    "connectionId": "conn_cm2k9x1b0000108l6a2b3c4d5",
    "name": "Plaid Savings",
    "institutionName": "First Platypus Bank",
    "type": "depository",
    "subtype": "savings",
    "mask": "1111",
    "availableBalance": 250000,
    "currentBalance": 250000,
    "currency": "USD",
    "lastSynced": "2025-10-21T15:35:00.000Z"
  }
]
```

---

### Step 7: Get Consolidated Balance

**User Action:**
```
User sees total balance widget on dashboard
```

**API Request:**
```http
GET /api/bank-accounts/consolidated-balance
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**What Happens:**
```typescript
// Sum all available balances across all bank accounts
const accounts = await prisma.bankAccount.findMany({
  where: { userId: user.id }
});

const totalAvailable = accounts.reduce((sum, acc) => sum + acc.availableBalance, 0);
const totalCurrent = accounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
```

**Response:**
```json
{
  "totalAvailable": 350000,  // £3,500.00
  "totalCurrent": 360000,    // £3,600.00
  "currency": "USD",
  "accountCount": 2
}
```

**User Experience:**
```
┌─────────────────────────────────┐
│  Total Available Balance        │
│  $3,500.00                      │
│  Across 2 accounts              │
└─────────────────────────────────┘
```

---

## Phase 2: Investment Account Creation

### Step 8: Create Investment Account

**User Action:**
```
User clicks "Create Investment Account"
Selects account type: "ISA" (Individual Savings Account)
Enters account name: "My Growth ISA"
Clicks "Create"
```

**API Request:**
```http
POST /api/investments/accounts
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "accountName": "My Growth ISA",
  "wrapperType": "ISA"
}
```

**What Happens (Backend - Current Prototype):**

```typescript
// 1. Generate unique client ID
const clientId = `CLIENT-${Date.now()}`;  // "CLIENT-1729534500000"

// 2. Call Mock Seccl API to create account
const secclResponse = await secclService.createAccount({
  firmId: "MOCK_FIRM",
  nodeId: "0",
  accountType: "Wrapper",
  name: "My Growth ISA",
  status: "Active",
  currency: "GBP",
  clientId: clientId,
  wrapperDetail: {
    wrapperType: "ISA"
  }
});
// Mock Seccl returns: { id: "ACC-1729534500-XYZ" }

// 3. Store in database
const account = await prisma.secclAccount.create({
  userId: user.id,
  secclAccountId: "ACC-1729534500-XYZ",
  secclClientId: clientId,
  firmId: "MOCK_FIRM",
  accountName: "My Growth ISA",
  accountType: "Wrapper",
  wrapperType: "ISA",
  currency: "GBP",
  status: "Active",
  cashBalance: 0,      // No money yet
  totalValue: 0
});
```

**Response:**
```json
{
  "id": "inv_cm2ka1e0000408l6m5n6o7p8",
  "secclAccountId": "ACC-1729534500-XYZ",
  "accountName": "My Growth ISA",
  "wrapperType": "ISA",
  "currency": "GBP",
  "status": "Active",
  "createdAt": "2025-10-21T15:40:00.000Z"
}
```

**User Experience:**
```
✅ Investment account created successfully!
Account ID: ACC-1729534500-XYZ
Type: ISA
Balance: £0.00
```

---

## Phase 3: Place Investment Order (THE CRITICAL FLOW)

### Step 9: Initiate Investment Order

**User Action:**
```
User sees dashboard:
  Bank Accounts: $3,500.00 available
  Investment Account: £0.00

User clicks "Invest Now"
Selects: Investment account "My Growth ISA"
Enters: Amount £100.00
Clicks "Place Order"
```

**API Request:**
```http
POST /api/investments/orders
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "secclAccountId": "inv_cm2ka1e0000408l6m5n6o7p8",
  "amount": 10000
}
```

**CRITICAL HEADERS:**
- `Authorization`: JWT token to identify user
- `Idempotency-Key`: Unique UUID to prevent duplicate orders (REQUIRED!)

---

### Step 10: Complete Investment Order Flow

**What Happens (Backend - Detailed Breakdown):**

#### **10.1: Validate Account Ownership**

```typescript
// Verify user owns this investment account
const account = await prisma.secclAccount.findUnique({
  where: { id: "inv_cm2ka1e0000408l6m5n6o7p8" }
});

if (!account || account.userId !== user.id) {
  throw new NotFoundException('Investment account not found');
}
// ✅ Verified: User owns account ACC-1729534500-XYZ
```

#### **10.2: Check Idempotency**

```typescript
// Check if order already exists with same idempotency key
const existing = await prisma.investmentOrder.findUnique({
  where: {
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000"
  }
});

if (existing) {
  // Return existing order (prevent duplicate)
  return existing;
}
// ✅ First time seeing this idempotency key - proceed
```

#### **10.3: Create Transaction Group (Payment + Order)**

**Current Implementation (SIMULATED):**

```typescript
// Calculate amounts
const paymentAmount = 10000;  // £100.00 in pence
const feeAmount = Math.floor(10000 * 0.02);  // 200 pence (2% fee)
const orderAmount = 10000 - 200;  // 9800 pence net investment

// Create transaction group in Mock Seccl
const transactionGroup = await secclService.createTransactionGroup({
  firmId: "MOCK_FIRM",
  accountId: "ACC-1729534500-XYZ",
  transactions: [
    {
      // TRANSACTION 1: SIMULATED PAYMENT
      firmId: "MOCK_FIRM",
      accountId: "ACC-1729534500-XYZ",
      transactionType: "Payment",
      transactionSubType: "Deposit",
      movementType: "In",
      currency: "GBP",
      amount: paymentAmount,  // 10000 pence
      method: "Bank Transfer"  // ⚠️ SIMULATED - No actual transfer!
    },
    {
      // TRANSACTION 2: BUY ORDER
      firmId: "MOCK_FIRM",
      accountId: "ACC-1729534500-XYZ",
      transactionType: "Order",
      transactionSubType: "At Best",
      movementType: "Invest",
      currency: "GBP",
      amount: orderAmount,  // 9800 pence (after 2% fee)
      assetId: "275F1"      // Money Market Fund
    }
  ]
});

// Mock Seccl returns:
// {
//   linkId: "TG-1729534600-ABC",
//   transactions: [
//     { id: "PAY-1729534600-DEF", transactionType: "Payment", status: "Pending" },
//     { id: "ORD-1729534600-GHI", transactionType: "Order", status: "Pending" }
//   ]
// }

// Store order in database
const order = await prisma.investmentOrder.create({
  userId: user.id,
  secclAccountId: account.id,
  fundId: "275F1",
  fundName: "Money Market Fund",
  amount: orderAmount,  // 9800 pence
  currency: "GBP",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  linkId: "TG-1729534600-ABC",
  paymentId: "PAY-1729534600-DEF",
  orderId: "ORD-1729534600-GHI",
  status: "PENDING"
});
```

**⚠️ CRITICAL LIMITATION - CURRENT PROTOTYPE:**
```
The "Bank Transfer" method is just a STRING LABEL!

NO ACTUAL MONEY MOVES FROM PLAID ACCOUNTS!

Bank account balance:     $3,500.00  ← UNCHANGED
Investment order created: £98.00     ← Just a database record

These are two separate, disconnected systems.
```

---

#### **10.4: Complete Payment Transaction**

```typescript
// Mark payment as complete in Mock Seccl
await secclService.completeTransaction("MOCK_FIRM", "PAY-1729534600-DEF", {
  type: "Action",
  firmId: "MOCK_FIRM",
  transactionAction: "Complete",
  actionReason: "Payment received",  // ⚠️ SIMULATED!
  completedDate: "2025-10-21T15:45:00.000Z"
});

// Update order status
await prisma.investmentOrder.update({
  where: { id: order.id },
  data: { status: "PAYMENT_COMPLETED" }
});
```

#### **10.5: Execute Order (Buy Fund Shares)**

```typescript
// Calculate shares purchased
const sharePrice = 2.27;  // £2.27 per share
const executedQuantity = Math.floor(9800 / (sharePrice * 100));  // 43 shares
const executedAmount = executedQuantity * sharePrice * 100;      // 9761 pence

// Complete order in Mock Seccl with execution details
await secclService.completeTransaction("MOCK_FIRM", "ORD-1729534600-GHI", {
  type: "Action",
  firmId: "MOCK_FIRM",
  transactionAction: "Complete",
  actionReason: "Order executed",
  completedDate: "2025-10-21T15:45:01.000Z",
  executionDetails: {
    currency: "GBP",
    price: 2.27,
    transactionTime: "15:45:01",
    venue: "XLON",
    executionAmount: 97.61,  // £97.61
    executedQuantity: 43     // 43 shares
  },
  quantity: 43,
  amount: 97.61
});

// Update order with execution details
await prisma.investmentOrder.update({
  where: { id: order.id },
  data: {
    status: "ORDER_COMPLETED",
    executedAt: new Date(),
    executedQuantity: 43,
    executionPrice: 2.27,
    executedAmount: 9761  // Actual amount invested
  }
});
```

**Math Breakdown:**
```
User deposits:        £100.00 (10000 pence)
Platform fee (2%):    -£2.00  (200 pence)
Net investment:       £98.00  (9800 pence)
Share price:          £2.27
Shares purchased:     43 shares
Actual invested:      £97.61  (43 × £2.27)
Rounding difference:  £0.39   (returned to cash balance)
```

#### **10.6: Update Position (Create or Accumulate)**

```typescript
// Generate position ID
const positionId = `ACC-1729534500-XYZ|S|275F1`;

// Check if position already exists
const existingPosition = await prisma.investmentPosition.findUnique({
  where: { secclPositionId: positionId }
});

if (existingPosition) {
  // ✅ ACCUMULATE shares (don't replace!)
  await prisma.investmentPosition.update({
    where: { id: existingPosition.id },
    data: {
      quantity: existingPosition.quantity + 43,     // Add shares
      bookValue: existingPosition.bookValue + 9761, // Add cost
      currentValue: existingPosition.currentValue + 9761,
      lastUpdatedAt: new Date()
    }
  });
} else {
  // Create new position
  await prisma.investmentPosition.create({
    userId: user.id,
    secclAccountId: account.id,
    secclPositionId: positionId,
    fundId: "275F1",
    fundName: "Money Market Fund",
    isin: "GB00MOCK1234",
    quantity: 43,
    bookValue: 9761,
    currentValue: 9761,
    growth: 0,
    growthPercent: 0,
    currency: "GBP"
  });
}
```

---

**Response:**
```json
{
  "id": "ord_cm2kb2f0000508l6q6r7s8t9",
  "fundId": "275F1",
  "fundName": "Money Market Fund",
  "amount": 9761,
  "currency": "GBP",
  "status": "ORDER_COMPLETED",
  "executedAt": "2025-10-21T15:45:01.000Z",
  "executedQuantity": 43,
  "executionPrice": 2.27,
  "executedAmount": 9761,
  "createdAt": "2025-10-21T15:45:00.000Z"
}
```

**User Experience:**
```
✅ Order Executed Successfully!

Investment Summary:
------------------
Amount Deposited:    £100.00
Platform Fee (2%):   -£2.00
Net Investment:      £98.00
Shares Purchased:    43
Fund:                Money Market Fund (275F1)
Price per Share:     £2.27
Total Value:         £97.61

Your Position:
Fund: Money Market Fund
Shares: 43
Value: £97.61
Growth: £0.00 (0%)
```

---

## Phase 4: View Investment Summary

### Step 11: Check Investment Positions

**User Action:**
```
User clicks "My Investments" tab
```

**API Request:**
```http
GET /api/investments/positions
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
[
  {
    "id": "pos_cm2kb3g0000608l6u7v8w9x0",
    "secclPositionId": "ACC-1729534500-XYZ|S|275F1",
    "fundId": "275F1",
    "fundName": "Money Market Fund",
    "isin": "GB00MOCK1234",
    "quantity": 43,
    "bookValue": 9761,
    "currentValue": 9761,
    "growth": 0,
    "growthPercent": 0,
    "currency": "GBP",
    "lastUpdatedAt": "2025-10-21T15:45:01.000Z"
  }
]
```

---

### Step 12: Get Account Summary

**User Action:**
```
User clicks on "My Growth ISA" account
Views detailed summary
```

**API Request:**
```http
GET /api/investments/accounts/inv_cm2ka1e0000408l6m5n6o7p8/summary
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**What Happens:**
```typescript
// Fetch summary from Mock Seccl
const summary = await secclService.getAccountSummary(
  "MOCK_FIRM",
  "ACC-1729534500-XYZ"
);

// Mock Seccl returns aggregated data from in-memory storage
```

**Response:**
```json
{
  "accountId": "ACC-1729534500-XYZ",
  "firmId": "MOCK_FIRM",
  "accountName": "My Growth ISA",
  "wrapperType": "ISA",
  "currency": "GBP",
  "cashBalance": 0,
  "totalValue": 9761,
  "totalInvested": 9761,
  "totalGrowth": 0,
  "totalGrowthPercent": 0,
  "positions": [
    {
      "assetId": "275F1",
      "assetName": "Money Market Fund",
      "quantity": 43,
      "bookValue": 9761,
      "currentValue": 9761,
      "growth": 0,
      "growthPercent": 0
    }
  ],
  "recentTransactions": [
    {
      "id": "PAY-1729534600-DEF",
      "transactionType": "Payment",
      "status": "Completed",
      "amount": 10000,
      "transactionDate": "2025-10-21T15:45:00.000Z"
    },
    {
      "id": "ORD-1729534600-GHI",
      "transactionType": "Order",
      "status": "Completed",
      "amount": 9800,
      "transactionDate": "2025-10-21T15:45:01.000Z"
    }
  ]
}
```

**User Experience:**
```
┌─────────────────────────────────────────┐
│  My Growth ISA (ISA)                    │
│  Account: ACC-1729534500-XYZ            │
├─────────────────────────────────────────┤
│  Cash Balance:       £0.00              │
│  Invested:           £97.61             │
│  Total Value:        £97.61             │
│  Growth:             £0.00 (0%)         │
├─────────────────────────────────────────┤
│  Holdings:                              │
│  • Money Market Fund (275F1)            │
│    43 shares @ £2.27 = £97.61           │
├─────────────────────────────────────────┤
│  Recent Transactions:                   │
│  • 21 Oct - Deposit    +£100.00         │
│  • 21 Oct - Buy Order  43 shares        │
└─────────────────────────────────────────┘
```

---

## Complete User Journey Summary

```
┌──────────────────────────────────────────────────────────────┐
│                    COMPLETE USER FLOW                        │
└──────────────────────────────────────────────────────────────┘

1. Register & Login
   → User: john.doe@company.com
   → JWT token: eyJhbGci...
   ✅ Authenticated

2. Connect Bank via Plaid
   → Select: First Platypus Bank
   → Accounts: Checking ($1,000), Savings ($2,500)
   → Total: $3,500.00 available
   ✅ Bank connected

3. Create Investment Account
   → Type: ISA
   → Name: "My Growth ISA"
   → Account: ACC-1729534500-XYZ
   ✅ Investment account ready

4. Place Investment Order
   → Amount: £100.00
   → Fee: £2.00 (2%)
   → Net: £98.00
   → Fund: 275F1 (Money Market)
   → Shares: 43 @ £2.27
   ✅ Order executed

5. View Portfolio
   → Investment value: £97.61
   → Cash remaining: £0.39
   → Growth: £0.00
   ✅ Portfolio tracking active

CURRENT STATE:
Bank Account:       $3,500.00 (UNCHANGED - no actual transfer)
Investment Account: £97.61 in Money Market Fund
```

---

---

# 🚀 PRODUCTION IMPLEMENTATION: Real Fund Transfers

## Current Limitation

**The prototype simulates fund transfer** - no money actually moves from Plaid bank accounts to Seccl investment accounts.

The `method: "Bank Transfer"` in the payment transaction is just a label. The two systems are disconnected:

```
Plaid Bank Accounts    ❌ NO BRIDGE ❌    Seccl Investment Accounts
$3,500.00 (unchanged)                     £97.61 (just records)
```

---

## Production Implementation: Bridging the Gap

### Overview of Changes Needed

To make this production-ready with **real money movement**, we need to:

1. **Add Plaid Transfer API integration** (debit from bank account)
2. **Implement webhook handling** for transfer status updates
3. **Add transfer state tracking** in database
4. **Handle async order execution** (wait for transfer settlement)
5. **Implement rollback logic** for failed transfers
6. **Add reconciliation** (verify transfers match orders)

---

### Architecture: Current vs Production

#### **Current (Prototype)**
```
User clicks "Invest £100"
    ↓
Create investment order
    ↓
Simulate payment transaction (just a record!)
    ↓
Execute order immediately
    ↓
Create position (43 shares)
    ↓
✅ Done (bank account unchanged)
```

#### **Production (With Plaid Transfer)**
```
User clicks "Invest £100"
    ↓
1. Authorize transfer with Plaid (check funds)
    ↓
2. Create Plaid transfer (debit bank account)
    ↓
3. Store transfer ID, mark order as "TRANSFER_PENDING"
    ↓
⏳ WAIT for transfer to settle (async!)
    ↓
4. Plaid webhook: "Transfer settled"
    ↓
5. Fund Seccl account (now we have real money!)
    ↓
6. Execute investment order
    ↓
7. Create position (43 shares)
    ↓
✅ Done (bank account reduced by £100, investment has £98)
```

---

## Step-by-Step Production Implementation

### **Step 10.3 Enhanced: Create Transaction Group WITH Real Transfer**

Replace the simulated payment with actual Plaid Transfer API:

```typescript
// ===================================================================
// PRODUCTION IMPLEMENTATION: Real Fund Transfer via Plaid
// ===================================================================

async createTransactionGroup(
  tx: Prisma.TransactionClient,
  accountId: string,
  secclAccountId: string,
  amount: number,  // 10000 pence = £100.00
  userId: string,
  idempotencyKey: string,
) {
  const paymentAmount = amount;  // 10000 pence
  const orderAmount = Math.floor(amount * 0.98);  // 9800 pence (after 2% fee)

  // ---------------------------------------------------------------
  // NEW: Get user's bank account for transfer
  // ---------------------------------------------------------------
  const bankAccount = await this.getBankAccountForTransfer(tx, userId);

  if (!bankAccount) {
    throw new BadRequestException(
      'No bank account available. Please connect a bank account first.'
    );
  }

  // Convert pence to dollars for Plaid (assuming GBP → USD conversion)
  // In production, you'd use actual FX rate
  const amountInDollars = (paymentAmount / 100).toFixed(2);  // "100.00"

  // ---------------------------------------------------------------
  // NEW: Decrypt Plaid access token (stored encrypted!)
  // ---------------------------------------------------------------
  const accessToken = this.encryptionService.decrypt(
    bankAccount.connection.accessToken
  );

  // ---------------------------------------------------------------
  // STEP 1: Authorize transfer with Plaid
  // ---------------------------------------------------------------
  this.logger.info('Authorizing Plaid transfer', {
    userId,
    bankAccountId: bankAccount.id,
    amount: amountInDollars,
    idempotencyKey
  });

  const authResponse = await this.plaidService.transferAuthorizationCreate({
    access_token: accessToken,
    account_id: bankAccount.plaidAccountId,
    type: "debit",  // Withdraw money from user's account
    amount: amountInDollars,
    network: "same-day-ach",  // Fast transfer (settles same day)
    idempotency_key: idempotencyKey,  // Prevent duplicate transfers
    ach_class: "ppd",  // Standard consumer transfer
    user_present: true,  // User initiated this transfer
    user: {
      legal_name: await this.getUserLegalName(userId)
    }
  });

  // ---------------------------------------------------------------
  // STEP 2: Check authorization decision
  // ---------------------------------------------------------------
  if (authResponse.authorization.decision !== 'approved') {
    const reason = authResponse.authorization.decision_rationale;

    this.logger.warn('Transfer authorization declined', {
      userId,
      reason,
      decision: authResponse.authorization.decision
    });

    // Common reasons: insufficient funds, account closed, etc.
    if (reason?.code === 'NSF') {
      throw new BadRequestException(
        `Insufficient funds. Available: $${bankAccount.availableBalance / 100}`
      );
    }

    throw new BadRequestException(
      `Transfer not authorized: ${reason?.description || 'Unknown reason'}`
    );
  }

  this.logger.info('Transfer authorized', {
    authorizationId: authResponse.authorization.id,
    decision: authResponse.authorization.decision
  });

  // ---------------------------------------------------------------
  // STEP 3: Create actual Plaid transfer
  // ---------------------------------------------------------------
  const transferResponse = await this.plaidService.transferCreate({
    access_token: accessToken,
    account_id: bankAccount.plaidAccountId,
    description: `Rest Treasury investment order`,
    amount: amountInDollars,
    authorization_id: authResponse.authorization.id,
    metadata: {
      user_id: userId,
      investment_account_id: secclAccountId,
      idempotency_key: idempotencyKey
    }
  });

  const plaidTransferId = transferResponse.transfer.id;
  const transferStatus = transferResponse.transfer.status;

  this.logger.info('Plaid transfer created', {
    transferId: plaidTransferId,
    status: transferStatus,
    amount: amountInDollars
  });

  // ---------------------------------------------------------------
  // STEP 4: Store order with transfer details (NOT yet executed!)
  // ---------------------------------------------------------------
  const order = await this.investmentOrderRepo.create(tx, {
    userId,
    secclAccountId: accountId,
    fundId: this.MONEY_MARKET_FUND_ID,
    fundName: this.MONEY_MARKET_FUND_NAME,
    amount: orderAmount,  // 9800 pence (after fee)
    currency: this.DEFAULT_CURRENCY,
    idempotencyKey,

    // NEW: Track Plaid transfer
    plaidTransferId: plaidTransferId,
    plaidTransferStatus: transferStatus,  // "pending"
    bankAccountId: bankAccount.id,

    // Order is NOT executed yet - waiting for transfer to settle
    status: 'TRANSFER_PENDING',  // NEW STATUS

    // Seccl transaction IDs will be populated later
    linkId: null,
    paymentId: null,
    orderId: null
  });

  // ---------------------------------------------------------------
  // STEP 5: Update bank account balance (optimistic update)
  // ---------------------------------------------------------------
  await this.bankAccountRepo.update(tx, bankAccount.id, {
    availableBalance: bankAccount.availableBalance - paymentAmount,
    // Note: currentBalance stays same until transfer settles
  });

  this.logger.info('Order created, awaiting transfer settlement', {
    orderId: order.id,
    plaidTransferId,
    status: 'TRANSFER_PENDING'
  });

  // ---------------------------------------------------------------
  // RETURN: Order is created but NOT executed
  // Execution happens later via webhook when transfer settles
  // ---------------------------------------------------------------
  return {
    order,
    plaidTransferId,
    orderAmount,
    // No paymentId/orderId yet - those are created after settlement
    transferStatus: 'pending'
  };
}

// ===================================================================
// HELPER: Get bank account for transfers
// ===================================================================
private async getBankAccountForTransfer(
  tx: Prisma.TransactionClient,
  userId: string
) {
  // Find bank account with highest available balance
  const accounts = await this.bankAccountRepo.findByUserId(tx, userId, {
    include: { connection: true },
    orderBy: { availableBalance: 'desc' },
    where: {
      type: 'depository',  // Only checking/savings
      connection: {
        status: 'ACTIVE'
      }
    }
  });

  if (accounts.length === 0) {
    return null;
  }

  // Return account with most funds
  return accounts[0];
}

// ===================================================================
// HELPER: Get user's legal name for transfer
// ===================================================================
private async getUserLegalName(userId: string): Promise<string> {
  const user = await this.prisma.user.findUnique({
    where: { id: userId }
  });

  // In production, you'd get this from KYC verification
  return user?.name || 'Unknown';
}
```

---

### **User Experience After Transfer Creation:**

**Response (Modified):**
```json
{
  "id": "ord_cm2kb2f0000508l6q6r7s8t9",
  "fundId": "275F1",
  "fundName": "Money Market Fund",
  "amount": 9800,
  "currency": "GBP",
  "status": "TRANSFER_PENDING",  // ← NEW STATUS
  "plaidTransferId": "transfer-sandbox-abc123-xyz",
  "plaidTransferStatus": "pending",
  "createdAt": "2025-10-21T15:45:00.000Z",

  // NOT yet available (waiting for settlement):
  "executedAt": null,
  "executedQuantity": null,
  "executionPrice": null,
  "executedAmount": null
}
```

**User sees:**
```
⏳ Transfer in Progress

Your investment order has been created and the bank transfer
has been initiated.

Status: Awaiting bank transfer settlement
Amount: £100.00
Transfer ID: transfer-sandbox-abc123-xyz

Estimated completion: Within 24 hours

We'll notify you when your investment order is executed.
```

---

### **Step 10.4-10.6 Enhanced: Webhook-Triggered Order Execution**

Now we need a webhook handler to complete the order when the transfer settles:

```typescript
// ===================================================================
// NEW FILE: src/plaid/plaid-webhook.controller.ts
// ===================================================================

@Controller('webhooks/plaid')
export class PlaidWebhookController {
  constructor(
    private readonly plaidWebhookService: PlaidWebhookService,
    private readonly logger: LoggerService
  ) {}

  @Post('transfer')
  async handleTransferWebhook(
    @Body() payload: PlaidTransferWebhook,
    @Headers('plaid-verification') signature: string
  ) {
    // CRITICAL: Verify webhook signature to prevent spoofing
    const isValid = this.verifyPlaidWebhookSignature(payload, signature);

    if (!isValid) {
      this.logger.error('Invalid webhook signature', { payload });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.info('Plaid transfer webhook received', {
      webhookType: payload.webhook_type,
      webhookCode: payload.webhook_code
    });

    // Process webhook asynchronously
    if (payload.webhook_code === 'TRANSFER_EVENTS_UPDATE') {
      await this.plaidWebhookService.handleTransferEventsUpdate();
    }

    return { received: true };
  }

  private verifyPlaidWebhookSignature(payload: any, signature: string): boolean {
    // In production: verify HMAC signature
    // See: https://plaid.com/docs/api/webhooks/webhook-verification/
    const secret = this.configService.get('PLAID_WEBHOOK_SECRET');
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  }
}

// ===================================================================
// NEW FILE: src/plaid/plaid-webhook.service.ts
// ===================================================================

@Injectable()
export class PlaidWebhookService {
  constructor(
    private readonly plaidService: PlaidService,
    private readonly investmentOrderExecutionService: InvestmentOrderExecutionService,
    private readonly investmentOrderRepo: InvestmentOrderRepository,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService
  ) {
    this.logger.setContext('PlaidWebhookService');
  }

  /**
   * Handle TRANSFER_EVENTS_UPDATE webhook
   *
   * This webhook tells us transfer statuses have changed.
   * We need to sync all transfer events to get the latest.
   */
  async handleTransferEventsUpdate() {
    this.logger.info('Syncing transfer events');

    // Get last processed event ID from database
    const lastEvent = await this.getLastProcessedTransferEvent();
    const afterId = lastEvent?.plaidEventId || 0;

    // Fetch new transfer events from Plaid
    const response = await this.plaidService.transferEventSync({
      after_id: afterId,
      count: 100
    });

    this.logger.info('Transfer events fetched', {
      count: response.transfer_events.length
    });

    // Process each event
    for (const event of response.transfer_events) {
      await this.processTransferEvent(event);
    }
  }

  /**
   * Process individual transfer event
   */
  private async processTransferEvent(event: PlaidTransferEvent) {
    const { transfer_id, event_type, timestamp } = event;

    this.logger.info('Processing transfer event', {
      transferId: transfer_id,
      eventType: event_type,
      timestamp
    });

    // Find order associated with this transfer
    const order = await this.investmentOrderRepo.findByPlaidTransferId(
      transfer_id
    );

    if (!order) {
      this.logger.warn('No order found for transfer', { transferId: transfer_id });
      return;
    }

    // Update order transfer status
    await this.investmentOrderRepo.update(order.id, {
      plaidTransferStatus: event_type
    });

    // Handle different event types
    switch (event_type) {
      case 'pending':
        await this.handleTransferPending(order);
        break;

      case 'posted':
        await this.handleTransferPosted(order);
        break;

      case 'settled':
        // 🎉 TRANSFER COMPLETED - Execute investment order!
        await this.handleTransferSettled(order, event);
        break;

      case 'failed':
      case 'cancelled':
      case 'returned':
        // ❌ TRANSFER FAILED - Rollback order
        await this.handleTransferFailed(order, event);
        break;

      default:
        this.logger.warn('Unhandled transfer event type', { eventType: event_type });
    }

    // Store event in database for audit trail
    await this.storeTransferEvent(event, order.id);
  }

  /**
   * Handle transfer pending (initial state)
   */
  private async handleTransferPending(order: InvestmentOrder) {
    this.logger.info('Transfer pending', { orderId: order.id });

    await this.investmentOrderRepo.update(order.id, {
      status: 'TRANSFER_PENDING'
    });

    // Notify user
    await this.notifyUser(order.userId, {
      type: 'TRANSFER_PENDING',
      message: 'Your bank transfer is being processed',
      orderId: order.id
    });
  }

  /**
   * Handle transfer posted (funds debited from account)
   */
  private async handleTransferPosted(order: InvestmentOrder) {
    this.logger.info('Transfer posted', { orderId: order.id });

    await this.investmentOrderRepo.update(order.id, {
      status: 'TRANSFER_POSTED'
    });

    // Notify user
    await this.notifyUser(order.userId, {
      type: 'TRANSFER_POSTED',
      message: 'Bank transfer posted - awaiting settlement',
      orderId: order.id
    });
  }

  /**
   * 🎉 Handle transfer settled - EXECUTE INVESTMENT ORDER!
   */
  private async handleTransferSettled(
    order: InvestmentOrder,
    event: PlaidTransferEvent
  ) {
    this.logger.info('Transfer settled - executing investment order', {
      orderId: order.id,
      transferId: event.transfer_id,
      amount: order.amount
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        // NOW we can create the Seccl transaction group
        // (payment already received via Plaid!)

        const transactionGroup = await this.secclService.createTransactionGroup({
          firmId: 'MOCK_FIRM',
          accountId: order.secclAccount.secclAccountId,
          transactions: [
            {
              // Payment transaction (reference to Plaid transfer)
              firmId: 'MOCK_FIRM',
              accountId: order.secclAccount.secclAccountId,
              transactionType: 'Payment',
              transactionSubType: 'Deposit',
              movementType: 'In',
              currency: 'GBP',
              amount: order.amount + (order.amount * 0.02),  // Original amount
              method: 'Bank Transfer',
              externalReference: event.transfer_id  // Link to Plaid transfer
            },
            {
              // Order transaction
              firmId: 'MOCK_FIRM',
              accountId: order.secclAccount.secclAccountId,
              transactionType: 'Order',
              transactionSubType: 'At Best',
              movementType: 'Invest',
              currency: 'GBP',
              amount: order.amount,  // Net amount
              assetId: '275F1'
            }
          ]
        });

        // Update order with Seccl transaction IDs
        await this.investmentOrderRepo.update(tx, order.id, {
          linkId: transactionGroup.linkId,
          paymentId: transactionGroup.transactions.find(t => t.transactionType === 'Payment')?.id,
          orderId: transactionGroup.transactions.find(t => t.transactionType === 'Order')?.id,
          status: 'PAYMENT_COMPLETED'
        });

        // Complete payment
        await this.investmentOrderExecutionService.completePayment(
          tx,
          order.id,
          transactionGroup.transactions.find(t => t.transactionType === 'Payment')!.id
        );

        // Complete order (execute buy)
        const { completedOrder, executedQuantity, executedAmount } =
          await this.investmentOrderExecutionService.completeOrder(
            tx,
            order.id,
            transactionGroup.transactions.find(t => t.transactionType === 'Order')!.id,
            order.amount
          );

        // Update position
        await this.investmentOrderExecutionService.updatePosition(
          tx,
          order.userId,
          order.secclAccountId,
          order.secclAccount.secclAccountId,
          executedQuantity,
          executedAmount
        );

        this.logger.info('Investment order executed successfully', {
          orderId: order.id,
          executedQuantity,
          executedAmount
        });
      });

      // Notify user of successful execution
      await this.notifyUser(order.userId, {
        type: 'ORDER_EXECUTED',
        message: 'Your investment order has been executed',
        orderId: order.id,
        details: {
          shares: order.executedQuantity,
          amount: order.executedAmount,
          fund: order.fundName
        }
      });

    } catch (error) {
      this.logger.error('Failed to execute investment order', {
        orderId: order.id,
        error: error.message
      });

      // Mark order as failed
      await this.investmentOrderRepo.update(order.id, {
        status: 'EXECUTION_FAILED',
        errorMessage: error.message
      });

      // In production: Alert operations team for manual intervention
      await this.alertOperationsTeam({
        severity: 'HIGH',
        message: 'Investment order execution failed after transfer settled',
        orderId: order.id,
        transferId: event.transfer_id,
        error: error.message
      });
    }
  }

  /**
   * ❌ Handle transfer failed - ROLLBACK ORDER
   */
  private async handleTransferFailed(
    order: InvestmentOrder,
    event: PlaidTransferEvent
  ) {
    this.logger.error('Transfer failed - rolling back order', {
      orderId: order.id,
      transferId: event.transfer_id,
      failureReason: event.failure_reason
    });

    await this.prisma.$transaction(async (tx) => {
      // Mark order as failed
      await this.investmentOrderRepo.update(tx, order.id, {
        status: 'TRANSFER_FAILED',
        errorMessage: event.failure_reason?.description || 'Transfer failed'
      });

      // Restore bank account balance (if we optimistically reduced it)
      if (order.bankAccountId) {
        const account = await this.bankAccountRepo.findById(tx, order.bankAccountId);
        if (account) {
          await this.bankAccountRepo.update(tx, account.id, {
            availableBalance: account.availableBalance + order.amount
          });
        }
      }
    });

    // Notify user of failure
    await this.notifyUser(order.userId, {
      type: 'TRANSFER_FAILED',
      message: 'Your bank transfer could not be completed',
      orderId: order.id,
      reason: event.failure_reason?.description,
      action: 'Please check your bank account or try a different account'
    });
  }

  // Helper methods...
  private async getLastProcessedTransferEvent() { /* ... */ }
  private async storeTransferEvent(event, orderId) { /* ... */ }
  private async notifyUser(userId, notification) { /* ... */ }
  private async alertOperationsTeam(alert) { /* ... */ }
}
```

---

### **Sandbox Testing Flow**

In development/sandbox, you can manually trigger transfer state changes:

```typescript
// ===================================================================
// TESTING: Simulate transfer progression in Plaid Sandbox
// ===================================================================

// After creating transfer, use magic amounts or manual simulation

// Option 1: Magic amounts (auto-progress)
// If you created transfer with amount $11.11, it will auto-complete:
// pending → posted → settled → funds_available

// Option 2: Manual simulation (more control)
await plaidClient.sandboxTransferSimulate({
  transfer_id: "transfer-sandbox-abc123-xyz",
  event_type: "posted"
});
// Order status: TRANSFER_PENDING → TRANSFER_POSTED

await plaidClient.sandboxTransferSimulate({
  transfer_id: "transfer-sandbox-abc123-xyz",
  event_type: "settled"
});
// Order status: TRANSFER_POSTED → executing investment... → ORDER_COMPLETED
// Webhook triggers, order executes, position created!

// Option 3: Test failure scenario
await plaidClient.sandboxTransferSimulate({
  transfer_id: "transfer-sandbox-abc123-xyz",
  event_type: "failed",
  failure_reason: {
    ach_return_code: "R01",  // Insufficient funds
    description: "Insufficient funds"
  }
});
// Order status: TRANSFER_PENDING → TRANSFER_FAILED
// Bank account balance restored

// Manually fire webhook (sandbox only)
await plaidClient.sandboxTransferFireWebhook({
  webhook: "https://your-app.com/webhooks/plaid/transfer"
});
```

---

## Summary: Current vs Production

### **Current Prototype:**
```
✅ User connects bank account (Plaid)
✅ User creates investment account (Mock Seccl)
✅ User places order
   → Simulates payment (no real transfer)
   → Executes order immediately
   → Creates position
✅ User views portfolio

❌ NO actual money movement
❌ Bank account balance unchanged
```

### **Production Implementation:**
```
✅ User connects bank account (Plaid)
✅ User creates investment account (Real Seccl)
✅ User places order
   → Authorize transfer with Plaid ✅
   → Create real Plaid transfer ✅
   → Debit bank account ✅
   ⏳ Wait for transfer settlement (async)
   → Webhook: Transfer settled ✅
   → Fund Seccl account ✅
   → Execute order ✅
   → Create position ✅
✅ User views portfolio

✅ Real money moved from bank to investment
✅ Bank account balance reduced
✅ Full audit trail
✅ Error handling & rollbacks
```

---

## Database Schema Changes Needed

Add transfer tracking to investment orders:

```prisma
model InvestmentOrder {
  id                   String   @id @default(uuid())
  userId               String
  secclAccountId       String

  // Existing fields...
  fundId               String
  fundName             String
  amount               Int
  currency             String
  idempotencyKey       String   @unique

  // NEW: Plaid transfer tracking
  plaidTransferId      String?  @unique
  plaidTransferStatus  String?  // "pending", "posted", "settled", "failed"
  bankAccountId        String?  // Which bank account was debited
  bankAccount          BankAccount? @relation(fields: [bankAccountId], references: [id])

  // NEW: Transfer events audit trail
  transferEvents       TransferEvent[]

  // Existing Seccl fields...
  linkId               String?
  paymentId            String?
  orderId              String?
  status               String   // "TRANSFER_PENDING", "TRANSFER_POSTED", etc.

  // ... rest of fields
}

// NEW: Transfer event audit trail
model TransferEvent {
  id                String   @id @default(uuid())
  plaidEventId      Int      @unique
  transferId        String
  investmentOrderId String?
  investmentOrder   InvestmentOrder? @relation(fields: [investmentOrderId], references: [id])

  eventType         String   // "pending", "posted", "settled", "failed"
  timestamp         DateTime
  failureReason     String?
  metadata          Json?

  createdAt         DateTime @default(now())

  @@index([transferId])
  @@index([investmentOrderId])
}
```

---

## Estimated Implementation Time

| Task | Time | Complexity |
|------|------|-----------|
| Add Plaid Transfer API to PlaidService | 1 hour | Medium |
| Update investment flow to create transfers | 1.5 hours | Medium |
| Create webhook handler & service | 2 hours | High |
| Add transfer event tracking | 1 hour | Medium |
| Database schema migration | 0.5 hour | Low |
| Handle transfer failures & rollbacks | 1.5 hours | High |
| Testing in sandbox | 1.5 hours | Medium |
| **TOTAL** | **~9 hours** | **Medium-High** |

**Conclusion:** While implementing real fund transfers is definitely achievable (4-9 hours), it's well beyond the 2-hour assignment constraint and the explicit "simulated cash receipt" requirement. The current prototype perfectly demonstrates architectural understanding without over-engineering.
