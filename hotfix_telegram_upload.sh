#!/bin/bash

# Hotfix script to upload Telegram data to Cloudflare API
# This bypasses GitHub Actions variable substitution issues

echo "🚀 Telegram Data Upload Hotfix"
echo "================================"

# Check if data file exists
if [ ! -f "telegram_posts.json" ]; then
    echo "❌ telegram_posts.json not found!"
    exit 1
fi

# Validate JSON
if ! python -m json.tool telegram_posts.json > /dev/null 2>&1; then
    echo "❌ Invalid JSON in telegram_posts.json"
    exit 1
fi

# Get post count
POST_COUNT=$(python -c "import json; data=json.load(open('telegram_posts.json')); print(len(data.get('results', [])))")
echo "📊 Found $POST_COUNT posts to upload"

if [ "$POST_COUNT" -eq 0 ]; then
    echo "⚠️ No posts to upload"
    exit 0
fi

# Upload using curl (bypasses Python requests issues)
echo "📤 Uploading to Cloudflare API..."

curl -X POST \
  -H "Content-Type: application/json" \
  -d @telegram_posts.json \
  --data-urlencode "secret=${TELEGRAM_UPDATE_SECRET}" \
  "https://chainreads.pages.dev/api/telegram/update" \
  --max-time 60 \
  --show-error \
  --fail

if [ $? -eq 0 ]; then
    echo "✅ Upload successful!"
else
    echo "❌ Upload failed!"
    exit 1
fi