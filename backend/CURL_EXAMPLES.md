# cURL Examples - Rest Treasury API

Quick reference for testing the API using cURL commands.

## Prerequisites

Set your base URL:
```bash
export BASE_URL="http://localhost:3000"
```

## 1. Health Check

```bash
curl -X GET "$BASE_URL/api/health"
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-21T15:00:00.000Z"
}
```

---

## 2. Authentication

### Register a New User

```bash
curl -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "John Doe"
  }'
```

**Expected Response:**
```json
{
  "id": "uuid-here",
  "email": "user@example.com",
  "name": "John Doe",
  "createdAt": "2025-10-21T15:00:00.000Z"
}
```

### Login

```bash
curl -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

**Expected Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Save the token for subsequent requests:**
```bash
export AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 3. Plaid Link Flow

### Create Link Token

```bash
curl -X POST "$BASE_URL/api/bank-connections/plaid/link-token" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Expected Response:**
```json
{
  "linkToken": "link-sandbox-abc123...",
  "expiration": "2025-10-21T16:00:00.000Z"
}
```

### Exchange Public Token

```bash
curl -X POST "$BASE_URL/api/bank-connections/plaid/exchange-token" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "publicToken": "public-sandbox-abc123..."
  }'
```

**Expected Response:**
```json
{
  "id": "connection-uuid",
  "institutionId": "ins_109508",
  "institutionName": "First Platypus Bank",
  "status": "ACTIVE",
  "accounts": [
    {
      "id": "account-uuid",
      "name": "Plaid Checking",
      "type": "depository",
      "subtype": "checking",
      "mask": "0000",
      "availableBalance": 100000,
      "currentBalance": 110000
    }
  ],
  "createdAt": "2025-10-21T15:00:00.000Z"
}
```

---

## 4. Bank Connections

### List Bank Connections

```bash
curl -X GET "$BASE_URL/api/bank-connections" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### Get Connection Details

```bash
curl -X GET "$BASE_URL/api/bank-connections/{CONNECTION_ID}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### Sync Bank Connection

```bash
curl -X POST "$BASE_URL/api/bank-connections/{CONNECTION_ID}/sync" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### Delete Bank Connection

```bash
curl -X DELETE "$BASE_URL/api/bank-connections/{CONNECTION_ID}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

---

## 5. Bank Accounts & Transactions

### List All Bank Accounts

```bash
curl -X GET "$BASE_URL/api/bank-accounts" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### Get Consolidated Balance

```bash
curl -X GET "$BASE_URL/api/bank-accounts/consolidated-balance" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Expected Response:**
```json
{
  "totalAvailable": 250000,
  "totalCurrent": 275000,
  "currency": "USD",
  "accountCount": 3
}
```

### Get Account Details

```bash
curl -X GET "$BASE_URL/api/bank-accounts/{ACCOUNT_ID}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### Get Account Transactions

```bash
curl -X GET "$BASE_URL/api/bank-accounts/{ACCOUNT_ID}/transactions?startDate=2025-01-01&endDate=2025-10-21" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

---

## 6. Investment Accounts & Orders

### Create Investment Account

```bash
curl -X POST "$BASE_URL/api/investments/accounts" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "My ISA Account",
    "wrapperType": "ISA"
  }'
```

**Expected Response:**
```json
{
  "id": "account-uuid",
  "secclAccountId": "ACC-123456",
  "accountName": "My ISA Account",
  "wrapperType": "ISA",
  "currency": "GBP",
  "status": "Active",
  "createdAt": "2025-10-21T15:00:00.000Z"
}
```

**Save the account ID:**
```bash
export INVESTMENT_ACCOUNT_ID="account-uuid"
```

### List Investment Accounts

```bash
curl -X GET "$BASE_URL/api/investments/accounts" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### Get Account Summary

```bash
curl -X GET "$BASE_URL/api/investments/accounts/{ACCOUNT_ID}/summary" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### Create Investment Order

**CRITICAL:** Requires `Idempotency-Key` header to prevent duplicate orders!

```bash
# Generate unique idempotency key (macOS/Linux)
IDEMPOTENCY_KEY=$(uuidgen)

curl -X POST "$BASE_URL/api/investments/orders" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "secclAccountId": "'"$INVESTMENT_ACCOUNT_ID"'",
    "amount": 10000
  }'
```

**Expected Response:**
```json
{
  "id": "order-uuid",
  "fundId": "275F1",
  "fundName": "Money Market Fund",
  "amount": 9800,
  "currency": "GBP",
  "status": "ORDER_COMPLETED",
  "executedQuantity": 43,
  "executionPrice": 2.27,
  "createdAt": "2025-10-21T15:00:00.000Z"
}
```

**Notes:**
- Amount is in pence (10000 = £100.00)
- 2% fee deducted automatically (£100 → £98 invested)
- Minimum amount: 100 pence (£1.00)

### List Investment Orders

```bash
# All orders
curl -X GET "$BASE_URL/api/investments/orders" \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Filter by account
curl -X GET "$BASE_URL/api/investments/orders?secclAccountId=$INVESTMENT_ACCOUNT_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### List Investment Positions

```bash
# All positions
curl -X GET "$BASE_URL/api/investments/positions" \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Filter by account
curl -X GET "$BASE_URL/api/investments/positions?secclAccountId=$INVESTMENT_ACCOUNT_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": "position-uuid",
    "fundId": "275F1",
    "fundName": "Money Market Fund",
    "quantity": 43,
    "bookValue": 9761,
    "currentValue": 9761,
    "growth": 0,
    "growthPercent": 0,
    "currency": "GBP"
  }
]
```

---

## Common Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```
**Solution:** Check your `AUTH_TOKEN` is set correctly.

### 400 Bad Request - Missing Idempotency Key
```json
{
  "statusCode": 400,
  "message": "Idempotency-Key header is required",
  "error": "Bad Request"
}
```
**Solution:** Add `Idempotency-Key` header to investment order requests.

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Resource not found",
  "error": "Not Found"
}
```
**Solution:** Verify the resource ID exists and belongs to your user.

---

## Tips

1. **Pretty Print JSON Responses:**
   ```bash
   curl ... | jq .
   ```

2. **Save Response to Variable:**
   ```bash
   RESPONSE=$(curl -s ...)
   echo $RESPONSE | jq .
   ```

3. **Extract Specific Field:**
   ```bash
   # Extract access token from login response
   AUTH_TOKEN=$(curl -s ... | jq -r '.accessToken')
   ```

4. **Verbose Output (Debug):**
   ```bash
   curl -v ...
   ```

5. **Follow Redirects:**
   ```bash
   curl -L ...
   ```

---

## Complete Workflow Example

```bash
#!/bin/bash

# Configuration
export BASE_URL="http://localhost:3000"

# 1. Register
echo "1. Registering user..."
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "name": "Test User"
  }' | jq .

# 2. Login and save token
echo -e "\n2. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }')

export AUTH_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
echo "Token saved: ${AUTH_TOKEN:0:20}..."

# 3. Create investment account
echo -e "\n3. Creating investment account..."
ACCOUNT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/investments/accounts" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "My ISA",
    "wrapperType": "ISA"
  }')

export INVESTMENT_ACCOUNT_ID=$(echo $ACCOUNT_RESPONSE | jq -r '.id')
echo "Account created: $INVESTMENT_ACCOUNT_ID"

# 4. Place investment order
echo -e "\n4. Placing investment order..."
IDEMPOTENCY_KEY=$(uuidgen)
curl -s -X POST "$BASE_URL/api/investments/orders" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "secclAccountId": "'"$INVESTMENT_ACCOUNT_ID"'",
    "amount": 10000
  }' | jq .

# 5. Check positions
echo -e "\n5. Checking positions..."
curl -s -X GET "$BASE_URL/api/investments/positions" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq .

echo -e "\n✅ Workflow complete!"
```

Save this as `test-workflow.sh`, make it executable (`chmod +x test-workflow.sh`), and run it to test the complete flow.
