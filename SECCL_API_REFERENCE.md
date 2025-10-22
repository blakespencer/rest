# Seccl API Reference - Investment Flow Endpoints

This document contains the exact Seccl API endpoints we're modeling for the Mock Seccl Service.

**Source:** Seccl API Documentation - Quickstart Guide
**Date:** 2025-01-20
**Purpose:** Reference for building MockSecclService that matches real Seccl API structure

---

## Authentication

All endpoints require:
```
Headers:
  Content-Type: application/json
  Authorization: Bearer {{YOUR_API_TOKEN}}
```

Authentication uses OAuth 2.0 with ClientID & Secret.

---

## 1. Create Investment Account

**Endpoint:** `POST /account`

**Description:** Creates an investment account (ISA, GIA, PENSION, etc.) for a client.

**Request Body:**
```json
{
  "firmId": "{{firmId}}",
  "nodeId": "0",
  "accountType": "Wrapper",
  "name": "Dream Cave ISA",
  "status": "Active",
  "currency": "GBP",
  "clientId": "{{clientId}}",
  "wrapperDetail": {
    "wrapperType": "ISA"
  }
}
```

**Required Fields:**
- `firmId` (string) - The firm identifier
- `nodeId` (string) - Node in organizational hierarchy (typically "0")
- `accountType` (string) - Type of account (typically "Wrapper")
- `name` (string) - Account name
- `status` (string) - Account status ("Active", "Pending", etc.)
- `currency` (string) - Currency code ("GBP", "USD", "EUR")
- `clientId` (string) - Client identifier
- `wrapperDetail.wrapperType` (string) - Wrapper type ("ISA", "GIA", "PENSION")

**Wrapper Types:**
- `ISA` - Individual Savings Account
- `GIA` - General Investment Account
- `PENSION` - Pension (SIPP)
- `JISA` - Junior Individual Savings Account

**Example Response:**
```json
{
  "data": {
    "id": "025F416"
  }
}
```

**Response Fields:**
- `data.id` (string) - The unique identifier for the created investment account (accountId)

**cURL Example:**
```bash
curl --location '{{apiRoute}}/account' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {{YOUR_API_TOKEN}}' \
  --data '{
    "firmId": "{{firmId}}",
    "nodeId": "0",
    "accountType": "Wrapper",
    "name": "Dream Cave ISA",
    "status": "Active",
    "currency": "GBP",
    "clientId": "{{clientId}}",
    "wrapperDetail": {
      "wrapperType": "ISA"
    }
  }'
```

---

## 2. Create Payment In and Order Expectation

**Endpoint:** `POST /portfoliotransactiongroup`

**Description:** Creates a grouped transaction that includes both a payment (cash deposit) and an order expectation (investment order). This is an atomic operation that links the cash receipt to the fund purchase.

**Use Case Example:**
Customer sends £10,000 from bank account → £10,000 deposited to Seccl account → £9,800 invested in fund (£200 reserved for fees)

**Request Body:**
```json
{
  "firmId": "{{firmId}}",
  "accountId": "{{accountId}}",
  "transactions": [
    {
      "firmId": "{{firmId}}",
      "accountId": "{{accountId}}",
      "transactionType": "Payment",
      "transactionSubType": "Deposit",
      "movementType": "In",
      "currency": "GBP",
      "amount": 10000,
      "method": "Bank Transfer"
    },
    {
      "firmId": "{{firmId}}",
      "accountId": "{{accountId}}",
      "transactionType": "Order",
      "transactionSubType": "At Best",
      "movementType": "Invest",
      "currency": "GBP",
      "amount": 9800,
      "assetId": "275F1"
    }
  ]
}
```

**Required Fields:**
- `firmId` (string) - The firm identifier
- `accountId` (string) - The account identifier
- `transactions` (array) - Array of transactions to execute atomically

**Payment Transaction Fields:**
- `transactionType` (string) - "Payment"
- `transactionSubType` (string) - "Deposit" for incoming cash
- `movementType` (string) - "In" for cash coming into account
- `currency` (string) - Currency code ("GBP", "USD", "EUR")
- `amount` (number) - Amount in pence (10000 = £100.00)
- `method` (string) - Payment method ("Bank Transfer", "Direct Debit", etc.)

**Order Transaction Fields:**
- `transactionType` (string) - "Order"
- `transactionSubType` (string) - "At Best" (market order)
- `movementType` (string) - "Invest" (buying assets)
- `currency` (string) - Currency code
- `amount` (number) - Amount to invest in pence (9800 = £98.00)
- `assetId` (string) - Asset/fund identifier (e.g., "275F1" for money market fund)

**Transaction Flow:**
1. Payment transaction creates cash deposit expectation
2. Order transaction creates pending order (awaits cash settlement)
3. Returns `linkId` that groups these transactions together
4. Order executes automatically after payment clears (~2 days)

**Example Response:**
```json
{
  "data": {
    "linkId": "TG-20250121-001",
    "transactions": [
      {
        "id": "00006B21S",
        "transactionType": "Payment",
        "status": "Pending"
      },
      {
        "id": "00006B22O",
        "transactionType": "Order",
        "status": "Pending"
      }
    ]
  }
}
```

**Response Fields (Inferred):**
- `data.linkId` (string) - Unique identifier linking the payment and order transactions together
- `data.transactions` (array) - Array of created transactions
  - `id` (string) - Unique transaction identifier (needed for completing payment/order)
  - `transactionType` (string) - "Payment" or "Order"
  - `status` (string) - Initial status (typically "Pending")

**Note:** Seccl documentation does not provide response examples. This structure is inferred from REST conventions and the transaction flow requirements. The mock service should return at minimum the `linkId` and transaction `id` values needed for subsequent API calls.

**cURL Example:**
```bash
curl --location '{{apiRoute}}/portfoliotransactiongroup' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {{YOUR_API_TOKEN}}' \
  --data '{
    "firmId": "{{firmId}}",
    "accountId": "{{accountId}}",
    "transactions": [
      {
        "firmId": "{{firmId}}",
        "accountId": "{{accountId}}",
        "transactionType": "Payment",
        "transactionSubType": "Deposit",
        "movementType": "In",
        "currency": "GBP",
        "amount": 10000,
        "method": "Bank Transfer"
      },
      {
        "firmId": "{{firmId}}",
        "accountId": "{{accountId}}",
        "transactionType": "Order",
        "transactionSubType": "At Best",
        "movementType": "Invest",
        "currency": "GBP",
        "amount": 9800,
        "assetId": "275F1"
      }
    ]
  }'
```

**Important Notes:**
- Amounts are in **pence/cents** (100 = £1.00 or $1.00)
- The payment amount is typically larger than order amount (difference reserved for fees)
- Transaction group is atomic (all succeed or all fail)
- Order remains pending until payment clears

---

## 3. Complete Payment

**Endpoint:** `PUT /portfoliotransactionaction/{firmId}/{transactionId}`

**Description:** Completes a pending payment transaction (mocks cash receipt). This is used in sandbox/testing to simulate the payment clearing. In production, this would happen automatically when the bank transfer settles.

**Use Case:**
After creating a payment in Step 2, this endpoint simulates the payment being received and processed. This allows the linked order to proceed to execution.

**Request Body:**
```json
{
  "type": "Action",
  "firmId": "{{firmId}}",
  "transactionAction": "Complete",
  "actionReason": "Payment received",
  "completedDate": "{{today}}"
}
```

**Required Fields:**
- `type` (string) - "Action" (indicates this is a transaction action)
- `firmId` (string) - The firm identifier
- `transactionAction` (string) - "Complete" (marks payment as completed)
- `actionReason` (string) - Reason for completing (e.g., "Payment received")
- `completedDate` (string) - Date payment completed (ISO format or "{{today}}")

**Path Parameters:**
- `firmId` (string) - The firm identifier
- `transactionId` (string) - The payment transaction ID (e.g., "00006B21S")

**Example Response:**
```json
{
  "data": {
    "id": "00006B21S",
    "transactionType": "Payment",
    "status": "Completed",
    "completedDate": "2025-01-21T00:00:00.000Z"
  }
}
```

**Response Fields (Inferred):**
- `data.id` (string) - The payment transaction ID
- `data.transactionType` (string) - "Payment"
- `data.status` (string) - Updated status ("Completed")
- `data.completedDate` (string) - ISO date when payment was completed

**Note:** Seccl documentation does not provide response examples. This structure is inferred from REST conventions. The mock service may return 200 OK with updated transaction object or 204 No Content.

**cURL Example:**
```bash
curl --location --request PUT '{{apiRoute}}/portfoliotransactionaction/{{firmId}}/00006B21S' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {{YOUR_API_TOKEN}}' \
  --data '{
    "type": "Action",
    "firmId": "{{firmId}}",
    "transactionAction": "Complete",
    "actionReason": "Payment received",
    "completedDate": "{{today}}"
  }'
```

**Transaction Flow:**
1. Payment created in Step 2 (status: Pending)
2. This endpoint marks payment as Complete
3. Linked order automatically proceeds to execution
4. Fund shares are allocated to account

**Important Notes:**
- This endpoint is for **sandbox testing only** (mocks payment receipt)
- In production, payments complete automatically when bank transfer settles
- After payment completes, the linked order moves to execution
- Transaction ID comes from the portfoliotransactiongroup response

---

## 4. Retrieve Pending Orders

**Endpoint:** `GET /portfoliotransaction/{firmId}`

**Description:** Retrieves pending orders for a specific transaction group. Used to get the `orderId` needed to complete/settle the order in the next step.

**Query Parameters:**
- `linkId` (string, required) - The transaction group ID returned from Step 2 (portfoliotransactiongroup)
- `transactionType` (string, required) - Filter by transaction type (use "Order" to get orders)

**Use Case:**
After creating payment + order in Step 2 and completing payment in Step 3, use this endpoint to retrieve the order details (including orderId) so you can manually settle/execute it.

**Example Response:**
```json
{
  "data": [
    {
      "id": "00006B22O",
      "firmId": "{{firmId}}",
      "accountId": "{{accountId}}",
      "transactionType": "Order",
      "transactionSubType": "At Best",
      "movementType": "Invest",
      "currency": "GBP",
      "amount": 9800,
      "assetId": "275F1",
      "status": "Pending",
      "linkId": "TG-20250121-001",
      "createdDate": "2025-01-21T00:00:00.000Z"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

**Note:** Seccl documentation does not provide response examples. This structure is inferred from REST conventions and matches the pattern seen in other Seccl GET endpoints (data array + meta object).

**cURL Example:**
```bash
curl --location '{{apiRoute}}/portfoliotransaction/{{firmId}}?linkId={{linkId}}&transactionType=Order' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {{YOUR_API_TOKEN}}'
```

**Response Fields:**
- `data` (array) - Array of order transactions matching the query
- `data[].id` (string) - Unique order identifier (needed for Step 5)
- `data[].firmId` (string) - Firm identifier
- `data[].accountId` (string) - Account identifier
- `data[].transactionType` (string) - "Order"
- `data[].transactionSubType` (string) - Order type ("At Best", "Limit", etc.)
- `data[].movementType` (string) - "Invest" for buy orders
- `data[].currency` (string) - Currency code
- `data[].amount` (number) - Order amount in pence
- `data[].assetId` (string) - Asset/fund identifier
- `data[].status` (string) - Order status ("Pending", "Completed", "Failed")
- `data[].linkId` (string) - Links back to the transaction group
- `meta.count` (number) - Number of orders returned

**Transaction Flow:**
1. Create payment + order (Step 2) → returns `linkId`
2. Complete payment (Step 3)
3. **Retrieve order using `linkId`** → returns `orderId`
4. Complete order using `orderId` (Step 5)

**Important Notes:**
- Use the `linkId` from Step 2 response
- Filter by `transactionType=Order` to get only orders (not payments)
- The `orderId` from response is needed for completing the order

---

## 5. Complete Order

**Endpoint:** `PUT /portfoliotransactionaction/{firmId}/{orderId}`

**Description:** Completes a pending order (mocks order execution). This is used in sandbox/testing to simulate the order being filled by the market. In production, this would happen automatically when the order executes on the exchange.

**Use Case:**
After retrieving the `orderId` in Step 4, this endpoint simulates the order being executed at a specific price, allocating fund shares to the account.

**Request Body:**
```json
{
  "firmId": "{{firmId}}",
  "type": "Action",
  "transactionAction": "Complete",
  "actionReason": "Order executed",
  "executionDetails": {
    "currency": "GBP",
    "price": 2.27,
    "transactionTime": "00:00:00",
    "venue": "XLON",
    "executionAmount": 2.27,
    "executedQuantity": 1
  },
  "quantity": 1,
  "amount": 2.27,
  "transactionDate": "{{today}}",
  "intendedSettlementDate": "{{today}}"
}
```

**Required Fields:**
- `firmId` (string) - The firm identifier
- `type` (string) - "Action" (indicates this is a transaction action)
- `transactionAction` (string) - "Complete" (marks order as executed)
- `actionReason` (string) - Reason for completing (e.g., "Order executed")
- `executionDetails` (object) - Details of how the order was filled
  - `currency` (string) - Currency code
  - `price` (number) - Execution price per share/unit
  - `transactionTime` (string) - Time of execution (HH:MM:SS)
  - `venue` (string) - Trading venue code (e.g., "XLON" for London Stock Exchange)
  - `executionAmount` (number) - Total amount paid for execution
  - `executedQuantity` (number) - Number of shares/units purchased
- `quantity` (number) - Total quantity filled
- `amount` (number) - Total amount of the order
- `transactionDate` (string) - Date order executed (ISO format or "{{today}}")
- `intendedSettlementDate` (string) - Date order settles (ISO format or "{{today}}")

**Path Parameters:**
- `firmId` (string) - The firm identifier
- `orderId` (string) - The order transaction ID from Step 4 (e.g., "00006B22O")

**Example Response:**
```json
{
  "data": {
    "id": "00006B22O",
    "transactionType": "Order",
    "status": "Completed",
    "executionDetails": {
      "currency": "GBP",
      "price": 2.27,
      "executedQuantity": 43,
      "executionAmount": 97.61,
      "transactionTime": "00:00:00",
      "venue": "XLON"
    },
    "completedDate": "2025-01-21T00:00:00.000Z"
  }
}
```

**Response Fields (Inferred):**
- `data.id` (string) - The order transaction ID
- `data.transactionType` (string) - "Order"
- `data.status` (string) - Updated status ("Completed")
- `data.executionDetails` (object) - Details of how the order was filled
- `data.completedDate` (string) - ISO date when order was completed

**Note:** Seccl documentation does not provide response examples. This structure is inferred from REST conventions. The mock service may return 200 OK with updated transaction object or 204 No Content.

**cURL Example:**
```bash
curl --location --request PUT '{{apiRoute}}/portfoliotransactionaction/{{firmId}}/{{orderTransaction0}}' \
  --header 'Authorization: Bearer {{YOUR_API_TOKEN}}' \
  --header 'Content-Type: application/json' \
  --data '{
    "firmId": "{{firmId}}",
    "type": "Action",
    "transactionAction": "Complete",
    "actionReason": "Order executed",
    "executionDetails": {
      "currency": "GBP",
      "price": 2.27,
      "transactionTime": "00:00:00",
      "venue": "XLON",
      "executionAmount": 2.27,
      "executedQuantity": 1
    },
    "quantity": 1,
    "amount": 2.27,
    "transactionDate": "{{today}}",
    "intendedSettlementDate": "{{today}}"
  }'
```

**Execution Details Calculation:**
For a £98.00 order at £2.27/share:
- `price`: 2.27 (price per share in pounds)
- `executedQuantity`: 43 (9800 pence ÷ 227 pence = ~43 shares)
- `executionAmount`: 97.61 (43 shares × £2.27 = £97.61)
- `amount`: 97.61 (total amount filled)

**Transaction Flow:**
1. Create payment + order (Step 2) → returns `linkId`
2. Complete payment (Step 3) → payment status: Completed
3. Retrieve order (Step 4) → get `orderId`
4. **Complete order** → order status: Filled
5. Shares now held in account (visible in positions)

**Important Notes:**
- This endpoint is for **sandbox testing only** (mocks order execution)
- In production, orders execute automatically when market conditions are met
- After order completes, shares appear in account positions
- Price and quantity determine how many shares are allocated
- Settlement typically T+2 (2 business days after execution)

---

## 6. Retrieve Account Summary

**Endpoint:** `GET /account/summary/{firmId}/{accountId}`

**Description:** Retrieves account summary including valuation and past transactions.

**Request:** No body required (GET request)

**Example Response:**
```json
{
  "data": {
    "accountId": "{{accountId}}",
    "firmId": "{{firmId}}",
    "accountName": "Dream Cave ISA",
    "wrapperType": "ISA",
    "currency": "GBP",
    "cashBalance": 200,
    "totalValue": 10000,
    "totalInvested": 10000,
    "totalGrowth": 0,
    "totalGrowthPercent": 0,
    "positions": [
      {
        "assetId": "275F1",
        "assetName": "Money Market Fund",
        "quantity": 43,
        "bookValue": 9800,
        "currentValue": 9800,
        "growth": 0,
        "growthPercent": 0
      }
    ],
    "recentTransactions": [
      {
        "id": "00006B22O",
        "transactionType": "Order",
        "status": "Completed",
        "amount": 9800,
        "transactionDate": "2025-01-21T00:00:00.000Z"
      },
      {
        "id": "00006B21S",
        "transactionType": "Payment",
        "status": "Completed",
        "amount": 10000,
        "transactionDate": "2025-01-21T00:00:00.000Z"
      }
    ]
  }
}
```

**Response Fields (Inferred):**
- `data.accountId` (string) - Account identifier
- `data.firmId` (string) - Firm identifier
- `data.accountName` (string) - Account name
- `data.wrapperType` (string) - Type of account (ISA, GIA, PENSION)
- `data.currency` (string) - Currency code
- `data.cashBalance` (number) - Uninvested cash balance in pence
- `data.totalValue` (number) - Total account value (cash + investments) in pence
- `data.totalInvested` (number) - Total amount invested in pence
- `data.totalGrowth` (number) - Absolute profit/loss in pence
- `data.totalGrowthPercent` (number) - Percentage return
- `data.positions` (array) - Current asset holdings
- `data.recentTransactions` (array) - Recent transaction history

**Note:** Seccl documentation does not provide response examples. This structure is inferred from REST conventions and typical account summary requirements.

**cURL Example:**
```bash
curl --location '{{apiRoute}}/account/summary/{{firmId}}/{{accountId}}' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {{YOUR_API_TOKEN}}'
```

---

## 7. Retrieve Position (Holdings)

**Endpoint:** `GET /position/{firmId}/{positionId}`

**Description:** Retrieves detailed information about a client's current holdings of a specific asset, including quantity, book value, current value, and transaction history.

**Use Case:**
After completing an order in Step 5, use this endpoint to view the fund/asset holdings in the account, including cost basis, quantity, and unrealized profit/loss.

**Path Parameters:**
- `firmId` (string) - The firm identifier
- `positionId` (string) - Position identifier (format: `{accountId}|{positionType}|{isin}`)

**Example Response:**
```json
{
  "data": {
    "id": "031832C|S|GB00B39J2M42",
    "accountId": "031832C",
    "accountName": "GIA 4 Stock split",
    "accountType": "Wrapper",
    "assetId": "2848S",
    "assetName": "United Utilities Group PLC",
    "auditDetails": {
      "application": "PortfolioProcessor",
      "updateDate": "2024-11-18T12:15:33.389Z",
      "userFirmId": "BACKGROUND",
      "userId": "Background",
      "version": 1
    },
    "currency": "GBP",
    "firmId": "SECCI",
    "isin": "GB00B39J2M42",
    "nodeId": "0",
    "positionType": "Stock",
    "quantity": 300,
    "bookValue": 441,
    "currentValue": 441,
    "growth": 0,
    "growthPercent": 0,
    "cgtData": {
      "realisedProfitLoss": 0,
      "unrealisedProfitLoss": 0
    },
    "instrumentType": "Equity",
    "assetCountryOfIssue": "GB",
    "transactions": [
      {
        "transactionId": "0000JBBBN",
        "transactionCode": "SPLI",
        "narrative": "Stock Split",
        "postDate": "2024-11-18T12:15:33.388Z",
        "valueDate": "2024-08-15T00:00:00.000Z",
        "quantity": 300,
        "value": 441,
        "bookValue": 441,
        "profitLoss": 0
      }
    ]
  }
}
```

**Key Response Fields:**

**Position Summary:**
- `id` (string) - Unique position identifier
- `accountId` (string) - Account identifier
- `accountName` (string) - Account name
- `accountType` (string) - Account type ("Wrapper" for ISA/GIA/Pension)
- `assetId` (string) - Asset identifier (e.g., "2848S")
- `assetName` (string) - Asset name (e.g., "United Utilities Group PLC")
- `currency` (string) - Currency code
- `isin` (string) - International Securities Identification Number
- `positionType` (string) - "Stock" or "Cash"

**Holding Details:**
- `quantity` (number) - Number of shares/units held
- `bookValue` (number) - Original cost basis (in pence if GBP)
- `currentValue` (number) - Current market value (in pence if GBP)
- `growth` (number) - Absolute profit/loss (currentValue - bookValue)
- `growthPercent` (number) - Percentage return

**Capital Gains Tax (CGT) Data:**
- `cgtData.realisedProfitLoss` (number) - Profit/loss from sold positions
- `cgtData.unrealisedProfitLoss` (number) - Unrealized gains/losses on current holdings

**Transaction History:**
- `transactions` (array) - All transactions that contributed to this position
  - `transactionId` (string) - Unique transaction ID
  - `transactionCode` (string) - Transaction type code
  - `narrative` (string) - Human-readable description
  - `postDate` (string) - Date transaction posted
  - `valueDate` (string) - Date transaction valued
  - `quantity` (number) - Units in this transaction
  - `value` (number) - Total value in pence
  - `bookValue` (number) - Cost basis allocated

**cURL Example:**
```bash
curl --location '{{apiRoute}}/position/{{firmId}}/{{positionId}}' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {{YOUR_API_TOKEN}}'
```

**Position ID Format:**
- Format: `{accountId}|{positionType}|{isin}`
- Example: `031832C|S|GB00B39J2M42`
  - `031832C` = Account ID
  - `S` = Stock position (or `C` for cash)
  - `GB00B39J2M42` = ISIN of the asset

**For Money Market Funds:**
- Position type will be "Stock" (even though it's a fund)
- Quantity represents fund shares held
- BookValue = original investment amount
- CurrentValue = current NAV × quantity

**Important Notes:**
- All monetary values in **pence** (441 = £4.41)
- `bookValue` tracks original cost (for CGT calculations)
- `currentValue` reflects current market value
- `growth` and `growthPercent` show performance
- Transaction history shows all buys/sells contributing to position

---

## Notes

- Base URL (apiRoute): `https://pfolio-api-staging.seccl.tech` (staging/sandbox)
- All monetary amounts likely in pence/cents (GBP: 100 = £1.00)
- Idempotency likely supported via headers or request body
- Account IDs, Client IDs, and Firm IDs are alphanumeric strings

---

## Mock Service Implementation Notes

When building MockSecclService:
1. ✅ Match request/response structure exactly
2. ✅ Use same field names and types
3. ✅ Respect required vs optional fields
4. ✅ Return realistic mock data
5. ✅ Implement idempotency where Seccl does
6. ❌ Don't need actual OAuth (mock the auth)
7. ❌ Don't need actual database (in-memory is fine for MVP)
