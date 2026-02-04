# 🔧 FIX EXCHANGE - COMPLETE GUIDE

## The Problem
Your exchange is returning 500 errors because the smart contract doesn't know which backend wallet is authorized to sign exchange requests.

## The Solution (3 Steps)

### Step 1: Get Your Backend Wallet Address

**EASIEST METHOD - Use the HTML Tool:**

1. Open `get-backend-address-simple.html` in your browser (just double-click it)
2. Go to Railway dashboard and copy your `BACKEND_WALLET_PRIVATE_KEY`
3. Paste it in the tool (it stays in your browser, never sent anywhere)
4. Click "Get Wallet Address"
5. Copy the address shown

**OR use command line:**

```bash
# PowerShell (Windows)
$env:BACKEND_WALLET_PRIVATE_KEY="YOUR_ACTUAL_PRIVATE_KEY_HERE"
node get-backend-address.js
```

**COPY THE ADDRESS** - you'll need it in Step 2.

---

### Step 2: Set Backend Address in Smart Contract

1. Go to BaseScan contract page:
   ```
   https://basescan.org/address/0xE42C06F57dac0D1bd1c794e2c495504A9CcD28B5#writeContract
   ```

2. Click **"Connect to Web3"** button (top of page)
   - Connect with the wallet that DEPLOYED the contract (owner wallet)
   - Make sure you're on Base network in MetaMask

3. Find the **`setBackend`** function (should be function #9 or #10)

4. Paste your backend wallet address from Step 1 into the `newBackend` field

5. Click **"Write"** button

6. Confirm the transaction in MetaMask

7. Wait for transaction to confirm (should take ~2 seconds)

---

### Step 3: Test Exchange

1. Go to your site: https://chainreads-production.up.railway.app

2. Connect your wallet

3. Go to "My Points" page

4. Click "Convert to Tokens"

5. Try exchanging 300 points for DEGEN

6. Should work now! 🎉

---

## What This Does

The smart contract has a security feature where only an authorized "backend" wallet can sign exchange requests. This prevents anyone from creating fake signatures.

When you call `setBackend()`, you're telling the contract: "This is my backend wallet address. Only accept signatures from this wallet."

The backend wallet is derived from the `BACKEND_WALLET_PRIVATE_KEY` you set in Railway.

---

## Verification

After setting the backend address, you can verify it worked:

1. Go to BaseScan contract page (Read Contract tab):
   ```
   https://basescan.org/address/0xE42C06F57dac0D1bd1c794e2c495504A9CcD28B5#readContract
   ```

2. Find the **`backend`** function

3. Click "Query" - it should show your backend wallet address

---

## Troubleshooting

### "Only owner" error
- You need to connect with the wallet that deployed the contract
- Check which wallet you used to deploy on BaseScan

### "Invalid backend address" error
- Make sure you copied the full address from Step 1
- Address should start with 0x and be 42 characters long

### Still getting 500 errors after setting backend
- Check Railway logs for specific error message
- Make sure `BACKEND_WALLET_PRIVATE_KEY` is set correctly in Railway
- Make sure `POINTS_CLAIM_CONTRACT` is set to `0xE42C06F57dac0D1bd1c794e2c495504A9CcD28B5`

### Exchange still failing with "An error occurred"
- Push the latest code changes to Railway first (improved error logging)
- Check Network DevTools Response tab for detailed error message
- Check Railway logs - now shows detailed error messages

---

## Need Help?

If you're still stuck, check the Response tab in Network DevTools when the exchange fails. The error message will tell you exactly what's wrong.

