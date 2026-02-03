#!/bin/bash

# GitHub Secrets Verification Script
# Run this to verify all required secrets are set in your repository

echo "🔍 Verifying GitHub Actions Secrets..."
echo "========================================"
echo ""

REQUIRED_SECRETS=(
  "TELEGRAM_API_ID"
  "TELEGRAM_API_HASH"
  "TELEGRAM_SESSION"
  "TELEGRAM_UPDATE_SECRET"
  "RAILWAY_API_URL"
  "TELEGRAM_TRADING_CHANNELS"
  "TELEGRAM_AIRDROP_CHANNELS"
)

echo "Required secrets for GitHub Actions:"
for secret in "${REQUIRED_SECRETS[@]}"; do
  echo "  - $secret"
done

echo ""
echo "To verify secrets are set, run:"
echo "  gh secret list"
echo ""
echo "To set a secret, run:"
echo "  gh secret set SECRET_NAME"
echo ""
echo "Example:"
echo "  gh secret set TELEGRAM_API_ID"
echo "  (then paste the value and press Ctrl+D)"
echo ""
echo "⚠️  CRITICAL: All secrets must be set before GitHub Actions will work!"
echo ""
echo "To test the workflow manually:"
echo "  gh workflow run update-telegram.yml"
echo ""
