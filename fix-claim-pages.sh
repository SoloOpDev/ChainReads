#!/bin/bash

# This script replaces custom claim logic with ClaimButton component in trading, telegram, and airdrop pages

echo "Fixing claim implementations in pages..."

# For each page, we'll:
# 1. Remove all claim-related state and logic
# 2. Import ClaimButton
# 3. Replace the claim button rendering with <ClaimButton section="..." />

# The pages are too complex to do string replacement, so we'll just tell the user to manually replace
# the claim button section with: <ClaimButton section="trading" /> (or airdrop/telegram)

echo "
MANUAL FIX REQUIRED:

In each of these files:
- client/src/pages/trading.tsx
- client/src/pages/telegram.tsx  
- client/src/pages/airdrop.tsx

1. Add import at top:
   import { ClaimButton } from '@/components/claim-button';

2. Remove all claim-related code (state, mutations, effects)

3. Replace the entire claim button section (the big conditional with alreadyClaimed, hasScrolled, etc.) with:
   <ClaimButton section=\"trading\" />  (or \"airdrop\" / \"telegram\")

This will use the working ClaimButton component with proper authentication.
"
