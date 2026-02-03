# Grant Points to Your Wallet - Quick Guide

## Option 1: Using Node.js Script (Easiest)

```bash
# Grant 1000 points to your wallet
node grant-points.js YOUR_WALLET_ADDRESS_HERE 1000
```

Example:
```bash
node grant-points.js 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 1000
```

---

## Option 2: Using cURL

```bash
curl -X POST http://localhost:3001/api/admin/grant-points \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "YOUR_WALLET_ADDRESS_HERE",
    "points": 1000,
    "adminSecret": "change-me-in-production"
  }'
```

---

## Option 3: Using PowerShell (Windows)

```powershell
$body = @{
    walletAddress = "YOUR_WALLET_ADDRESS_HERE"
    points = 1000
    adminSecret = "change-me-in-production"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/admin/grant-points" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

---

## Option 4: Using Postman or Thunder Client

**URL:** `POST http://localhost:3001/api/admin/grant-points`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "walletAddress": "YOUR_WALLET_ADDRESS_HERE",
  "points": 1000,
  "adminSecret": "change-me-in-production"
}
```

---

## Success Response

```json
{
  "success": true,
  "walletAddress": "0x...",
  "pointsGranted": 1000,
  "newBalance": 1000,
  "message": "Successfully granted 1000 points"
}
```

---

## Verify Your Points

After granting, check your balance:

```bash
curl http://localhost:3001/api/points/YOUR_WALLET_ADDRESS_HERE
```

Or visit in browser:
```
http://localhost:3001/api/points/YOUR_WALLET_ADDRESS_HERE
```

---

## Important Notes

1. **Admin Secret**: Currently using default `'change-me-in-production'`
   - For production, set a secure secret in `.env`:
     ```bash
     ADMIN_SECRET=your-secure-random-string
     ```

2. **Max Points**: You can grant up to 100,000 points per request

3. **Wallet Address**: Must be a valid Ethereum address (0x...)

4. **Server Must Be Running**: Make sure your dev server is running on port 3001

---

## Quick Test

1. Start your server:
   ```bash
   npm run dev
   ```

2. Grant points (replace with your wallet):
   ```bash
   node grant-points.js 0xYourWalletAddress 1000
   ```

3. Check balance:
   ```bash
   curl http://localhost:3001/api/points/0xYourWalletAddress
   ```

---

## Need Your Wallet Address?

If you're using MetaMask or another wallet, copy your address from there.

Example addresses look like:
- `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- `0x1234567890123456789012345678901234567890`

---

## Troubleshooting

**Error: "Unauthorized"**
- Check that adminSecret matches your ADMIN_SECRET env variable
- Default is `'change-me-in-production'`

**Error: "Invalid wallet address"**
- Make sure address starts with `0x`
- Address should be 42 characters long

**Error: "Connection refused"**
- Make sure server is running on port 3001
- Check `npm run dev` is active

---

## What's Your Wallet Address?

**Tell me your wallet address and I'll run the command for you!**

Just reply with your Ethereum wallet address (starts with 0x...) and I'll grant you 1000 points immediately.
