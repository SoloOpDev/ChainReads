#!/bin/bash

echo "🔄 Applying D1 Database Migrations"
echo "=================================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
fi

# Apply migrations locally first (for testing)
echo "📝 Applying migrations locally..."
wrangler d1 migrations apply chainreads-db --local

if [ $? -eq 0 ]; then
    echo "✅ Local migrations applied successfully"
else
    echo "❌ Local migrations failed"
    exit 1
fi

# Apply migrations to production
echo ""
echo "🚀 Applying migrations to production..."
wrangler d1 migrations apply chainreads-db

if [ $? -eq 0 ]; then
    echo "✅ Production migrations applied successfully"
else
    echo "❌ Production migrations failed"
    exit 1
fi

# Verify tables exist
echo ""
echo "🔍 Verifying tables..."
echo "Tables in database:"
wrangler d1 execute chainreads-db --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

echo ""
echo "Checking telegram_posts table structure:"
wrangler d1 execute chainreads-db --command="PRAGMA table_info(telegram_posts);"

echo ""
echo "✅ Migration complete!"
echo ""
echo "🧪 Test the setup:"
echo "1. Check if API endpoints work:"
echo "   curl https://chainreads.pages.dev/api/telegram/trading"
echo "   curl https://chainreads.pages.dev/api/telegram/airdrop"
echo ""
echo "2. Trigger GitHub Actions workflow to fetch new data"
echo "3. Check the endpoints again to see if data appears"