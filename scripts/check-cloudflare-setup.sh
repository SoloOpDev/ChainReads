#!/bin/bash

echo "🔍 Checking Cloudflare Setup for Telegram Scraping"
echo "=================================================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
fi

echo "✅ Wrangler CLI found"

# Check D1 database
echo ""
echo "📊 Checking D1 Database..."
wrangler d1 info chainreads-db 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ D1 database 'chainreads-db' exists"
else
    echo "❌ D1 database 'chainreads-db' not found"
    echo "   Run: wrangler d1 create chainreads-db"
    exit 1
fi

# Check if migrations are applied
echo ""
echo "🔄 Checking D1 Migrations..."
echo "Listing tables in D1 database:"
wrangler d1 execute chainreads-db --command="SELECT name FROM sqlite_master WHERE type='table';"

echo ""
echo "Checking if telegram_posts table exists:"
wrangler d1 execute chainreads-db --command="SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='telegram_posts';"

# Check KV namespace
echo ""
echo "🗄️  Checking KV Namespace..."
wrangler kv:namespace list | grep -q "9edbaeb1482e4b53aa9e381cbc139fe9"
if [ $? -eq 0 ]; then
    echo "✅ KV namespace exists"
else
    echo "❌ KV namespace not found"
    echo "   Run: wrangler kv:namespace create KV"
fi

# Check required secrets
echo ""
echo "🔐 Checking Required Secrets..."
REQUIRED_SECRETS=(
    "TELEGRAM_API_ID"
    "TELEGRAM_API_HASH" 
    "TELEGRAM_SESSION"
    "TELEGRAM_UPDATE_SECRET"
    "TELEGRAM_TRADING_CHANNELS"
    "TELEGRAM_AIRDROP_CHANNELS"
    "IMAGEKIT_PRIVATE_KEY"
    "IMAGEKIT_URL_ENDPOINT"
    "ADMIN_SECRET"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
    # Note: wrangler doesn't have a direct way to check if secrets exist
    # This is just a reminder list
    echo "   📝 Required: $secret"
done

echo ""
echo "⚠️  To set secrets, run:"
echo "   wrangler secret put TELEGRAM_API_ID"
echo "   wrangler secret put TELEGRAM_API_HASH"
echo "   wrangler secret put TELEGRAM_SESSION"
echo "   wrangler secret put TELEGRAM_UPDATE_SECRET"
echo "   wrangler secret put TELEGRAM_TRADING_CHANNELS"
echo "   wrangler secret put TELEGRAM_AIRDROP_CHANNELS"
echo "   wrangler secret put IMAGEKIT_PRIVATE_KEY"
echo "   wrangler secret put IMAGEKIT_URL_ENDPOINT"
echo "   wrangler secret put ADMIN_SECRET"

# Check GitHub Actions secrets
echo ""
echo "🐙 GitHub Actions Requirements:"
echo "   Make sure these secrets are set in your GitHub repository:"
echo "   - TELEGRAM_API_ID"
echo "   - TELEGRAM_API_HASH"
echo "   - TELEGRAM_SESSION"
echo "   - TELEGRAM_UPDATE_SECRET"
echo "   - TELEGRAM_TRADING_CHANNELS"
echo "   - TELEGRAM_AIRDROP_CHANNELS"
echo "   - IMAGEKIT_PRIVATE_KEY"
echo "   - IMAGEKIT_URL_ENDPOINT"

echo ""
echo "🚀 Next Steps:"
echo "1. Run D1 migrations if telegram_posts table doesn't exist:"
echo "   wrangler d1 migrations apply chainreads-db --local"
echo "   wrangler d1 migrations apply chainreads-db"
echo ""
echo "2. Test the API endpoints:"
echo "   curl https://chainreads.pages.dev/api/telegram/trading"
echo "   curl https://chainreads.pages.dev/api/telegram/airdrop"
echo ""
echo "3. Manually trigger GitHub Actions workflow to test scraping"
echo ""
echo "4. Check Cloudflare Pages deployment logs for any errors"

echo ""
echo "=================================================="
echo "✅ Setup check complete!"