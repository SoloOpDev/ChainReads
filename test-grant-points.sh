#!/bin/bash

# Quick test script to grant points
# Usage: ./test-grant-points.sh <wallet-address>

WALLET_ADDRESS="${1:-0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb}"
POINTS="${2:-1000}"
ADMIN_SECRET="${ADMIN_SECRET:-change-me-in-production}"
API_URL="${API_URL:-http://localhost:3001}"

echo "🎁 Granting Points to Wallet"
echo "=============================="
echo "Wallet: $WALLET_ADDRESS"
echo "Points: $POINTS"
echo "API: $API_URL"
echo ""

curl -X POST "$API_URL/api/admin/grant-points" \
  -H "Content-Type: application/json" \
  -d "{
    \"walletAddress\": \"$WALLET_ADDRESS\",
    \"points\": $POINTS,
    \"adminSecret\": \"$ADMIN_SECRET\"
  }" \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "✅ Done! Checking balance..."
echo ""

curl "$API_URL/api/points/$WALLET_ADDRESS" | json_pp 2>/dev/null || curl "$API_URL/api/points/$WALLET_ADDRESS"

echo ""
