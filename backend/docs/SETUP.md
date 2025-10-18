# Environment Setup Guide

This guide walks you through setting up your development environment for the Rest Treasury Service.

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose installed
- OpenSSL (comes with macOS/Linux)
- A Plaid account (free sandbox tier)

---

## Step 1: Clone and Install Dependencies

```bash
cd backend
npm install
```

---

## Step 2: Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

---

## Step 3: Generate Security Keys

Generate a secure encryption key (32 bytes for AES-256):

```bash
openssl rand -hex 32
```

Generate a JWT secret:

```bash
openssl rand -base64 32
```

Copy these values and update your `.env` file:

```bash
ENCRYPTION_KEY=<paste the hex value here>
JWT_SECRET=<paste the base64 value here>
```

---

## Step 4: Get Plaid Sandbox Credentials

### 4.1 Sign Up for Plaid

1. Go to [Plaid Dashboard](https://dashboard.plaid.com/signup)
2. Sign up for a free account
3. Complete the registration process

### 4.2 Get Your API Keys

1. After signing in, go to [Team Settings → Keys](https://dashboard.plaid.com/team/keys)
2. Find your **Sandbox** credentials:
   - **client_id**: Copy this value
   - **secret**: Copy the **sandbox** secret (not development or production)

### 4.3 Update .env File

Add your Plaid credentials to `.env`:

```bash
PLAID_CLIENT_ID=your_actual_client_id
PLAID_SECRET=your_actual_sandbox_secret
PLAID_ENV=sandbox
```

**Example:**
```bash
PLAID_CLIENT_ID=5f9a8b7c6d5e4f3a2b1c0d9e
PLAID_SECRET=1234567890abcdef1234567890abcdef
PLAID_ENV=sandbox
```

---

## Step 5: Configure Database

### 5.1 Update Database URL (if needed)

The default configuration uses PostgreSQL in Docker:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rest_treasury?schema=public"
```

This will work once you start the Docker container in the next steps.

---

## Step 6: Choose Investment Platform Approach

You have two options:

### Option A: Use Mock Seccl Service (Recommended for Quick Start)

This is the fastest way to get started. No additional setup required.

In your `.env`:
```bash
USE_MOCK_SECCL=true
```

### Option B: Use Real Seccl Sandbox (Optional)

If you want to test with the real Seccl API:

1. Sign up at [Seccl Developer Portal](https://developer.seccl.tech/)
2. Get your API credentials from the dashboard
3. Update your `.env`:

```bash
USE_MOCK_SECCL=false
SECCL_API_KEY=your_actual_api_key
SECCL_BASE_URL=https://sandbox-api.seccl.tech
SECCL_CLIENT_ID=your_client_id_if_required
```

---

## Step 7: Verify Your .env File

Your `.env` should look like this (with actual values):

```bash
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rest_treasury?schema=public"

# Security (YOUR GENERATED VALUES)
ENCRYPTION_KEY=908ecc434e4b6a4846e9947b20e32aa89f7a7944e5295ce23ee67481f552c135
JWT_SECRET=ewv5YpQrOe6NYyYPksaynbmYftU6v9ugoKTWIeByMRo=
JWT_EXPIRATION=24h

# Plaid (YOUR ACTUAL CREDENTIALS)
PLAID_CLIENT_ID=5f9a8b7c6d5e4f3a2b1c0d9e
PLAID_SECRET=1234567890abcdef1234567890abcdef
PLAID_ENV=sandbox
PLAID_VERSION=2020-09-14
PLAID_PRODUCTS=auth,transactions
PLAID_COUNTRY_CODES=US

# Seccl (Mock or Real)
USE_MOCK_SECCL=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=pretty

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
FINANCIAL_RATE_LIMIT_TTL=60
FINANCIAL_RATE_LIMIT_MAX=10

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Testing
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rest_treasury_test?schema=public"
MOCK_EXTERNAL_APIS=true
```

---

## Step 8: Start PostgreSQL Database

You'll set this up in Phase 1.2, but for now, make sure Docker is running.

```bash
# This will be created in the next phase
docker compose up -d postgres
```

---

## Step 9: Verify Setup

Check that all required environment variables are set:

```bash
# This script will be created to validate your .env
npm run validate:env
```

---

## Common Issues & Troubleshooting

### Issue: "PLAID_CLIENT_ID is required"

**Solution:** Make sure you've copied your Plaid credentials correctly from the dashboard. The client ID should not have any quotes or extra spaces.

### Issue: "Invalid encryption key"

**Solution:** The encryption key must be exactly 64 hexadecimal characters (32 bytes). Re-generate with:
```bash
openssl rand -hex 32
```

### Issue: "Cannot connect to database"

**Solution:**
1. Make sure Docker is running
2. Make sure PostgreSQL container is started: `docker compose up -d postgres`
3. Check the connection string in DATABASE_URL

### Issue: "Plaid API returns 'invalid_credentials'"

**Solution:**
1. Double-check you're using the **sandbox** secret, not development or production
2. Make sure PLAID_ENV=sandbox
3. Verify credentials at https://dashboard.plaid.com/team/keys

---

## Security Checklist

- [ ] .env file is NOT committed to git (check .gitignore)
- [ ] ENCRYPTION_KEY is 64 hex characters (32 bytes)
- [ ] JWT_SECRET is a strong random string
- [ ] Plaid credentials are from the sandbox environment
- [ ] Database password is secure (change default in production)

---

## Next Steps

Once your environment is configured:

1. ✅ Phase 1.1 complete!
2. Move to **Phase 1.2**: Database Setup
3. Create Prisma schema
4. Run migrations
5. Start building!

---

## Testing Your Setup

You can test individual components:

```bash
# Test Plaid connection (will be created later)
npm run test:plaid

# Test database connection (will be created later)
npm run test:db

# Test encryption service (will be created later)
npm run test:encryption
```

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Application environment | `development` |
| `PORT` | Yes | Application port | `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://...` |
| `ENCRYPTION_KEY` | Yes | 32-byte encryption key (64 hex) | `908ecc43...` |
| `JWT_SECRET` | Yes | JWT signing secret | `ewv5YpQr...` |
| `PLAID_CLIENT_ID` | Yes | Plaid client ID | `5f9a8b7c...` |
| `PLAID_SECRET` | Yes | Plaid sandbox secret | `12345678...` |
| `PLAID_ENV` | Yes | Plaid environment | `sandbox` |
| `USE_MOCK_SECCL` | No | Use mock Seccl service | `true` |
| `SECCL_API_KEY` | No* | Seccl API key | `sk_test_...` |
| `LOG_LEVEL` | No | Logging verbosity | `info` |

\* Required only if `USE_MOCK_SECCL=false`

---

## Support

If you run into issues:

1. Check this guide's troubleshooting section
2. Review the [Plaid Quickstart Guide](https://plaid.com/docs/quickstart/)
3. Check the [Plaid Sandbox documentation](https://plaid.com/docs/sandbox/)
4. Verify your .env file matches the format in .env.example

---

**Last Updated:** 2025-10-18
