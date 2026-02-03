-- Migration: Fix IP Binding Schema to Allow Multiple IPs per Wallet
-- Date: 2026-01-23
-- Issue: Users blocked when connecting from different IPs (home, work, mobile)
-- Fix: Change primary key from (wallet, type) to (ip, type)

-- Step 1: Drop existing primary key constraint
ALTER TABLE ip_bindings DROP CONSTRAINT IF EXISTS ip_bindings_pkey;

-- Step 2: Drop existing index
DROP INDEX IF EXISTS idx_ip_bindings_ip;

-- Step 3: Add new primary key (IP + binding type)
-- This allows: 1 wallet from multiple IPs
-- But prevents: multiple wallets from same IP
ALTER TABLE ip_bindings ADD PRIMARY KEY (ip_address, binding_type);

-- Step 4: Add index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_ip_bindings_wallet ON ip_bindings(wallet_address, binding_type);

-- Step 5: Clean up any duplicate IPs (keep most recent)
-- This handles case where multiple wallets used same IP during old schema
DELETE FROM ip_bindings a
USING ip_bindings b
WHERE a.ip_address = b.ip_address
  AND a.binding_type = b.binding_type
  AND a.bound_at < b.bound_at;

-- Verification query (run after migration):
-- SELECT ip_address, binding_type, COUNT(*) as count
-- FROM ip_bindings
-- GROUP BY ip_address, binding_type
-- HAVING COUNT(*) > 1;
-- Should return 0 rows
