# Quick Start Guide (5 Minutes)

Get up and running with Rest Treasury Service in 5 minutes.

## Prerequisites

- Node.js 18+
- Docker Desktop running
- Plaid account ([sign up free](https://dashboard.plaid.com/signup))

---

## 1. Install Dependencies (1 min)

```bash
cd backend
npm install
```

---

## 2. Setup Environment (2 min)

```bash
# Copy environment template
cp .env.example .env

# Generate security keys
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
```

---

## 3. Add Plaid Credentials (1 min)

1. Get your credentials: https://dashboard.plaid.com/team/keys
2. Edit `.env` and add:

```bash
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
```

---

## 4. Start Database (30 sec)

```bash
docker compose up -d postgres
```

---

## 5. Run Migrations (30 sec)

```bash
npx prisma migrate dev
```

---

## 6. Start Development Server (30 sec)

```bash
npm run start:dev
```

---

## ✅ Verify It's Working

Open http://localhost:3000 - you should see the API running!

---

## Next Steps

- Test Plaid connection: `POST /api/plaid/link-token`
- Read the full [SETUP.md](./SETUP.md) for detailed configuration
- Check out the [API documentation](../README.md#api-endpoints)

---

## Troubleshooting

**Can't connect to database?**
```bash
# Make sure Docker is running
docker compose ps

# Restart PostgreSQL
docker compose restart postgres
```

**Plaid API errors?**
- Verify you're using the **sandbox** secret (not development/production)
- Check credentials at: https://dashboard.plaid.com/team/keys

**Environment variable errors?**
- Run: `cat .env | grep -v '^#' | grep -v '^$'` to see all set variables
- Compare with `.env.example` to find missing values
