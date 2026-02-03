# Environment Variables

## Required

```bash
DATABASE_URL=postgresql://user:password@host:port/database
BACKEND_WALLET_PRIVATE_KEY=0x...
VITE_POINTS_CLAIM_CONTRACT=0x...
TELEGRAM_UPDATE_SECRET=your-secret-here
ADMIN_SECRET=your-admin-secret
```

## Optional

```bash
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE=
TELEGRAM_SESSION=
CRYPTOPANIC_API_KEY=
```

## Frontend (Public)

```bash
VITE_CHAIN_ID=8453
VITE_RPC_URL=https://mainnet.base.org
```

## Admin Endpoint

Grant points to wallet:
```bash
curl -X POST https://your-app.com/api/admin/grant-points \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x...", "points": 1000, "adminSecret": "..."}'
```
