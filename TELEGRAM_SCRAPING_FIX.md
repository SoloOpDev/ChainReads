# Telegram Scraping Fix Guide

## 🔍 Problem Analysis

The Telegram scraping was working on Railway but stopped working after migrating to Cloudflare. Here's what I found:

### ✅ What's Working:
- GitHub Actions workflow exists and runs every 6 hours
- Python scraping script (`fetch_telegram_enhanced.py`) is functional
- Cloudflare API endpoints exist (`/api/telegram/update`, `/api/telegram/trading`, `/api/telegram/airdrop`)
- D1 database schema includes `telegram_posts` table
- Data upload script (`send_to_api.py`) points to correct Cloudflare URL

### ❌ Issues Found:
1. **Trigger endpoint has placeholder GitHub repo info** (FIXED)
2. **D1 migrations might not be applied**
3. **Cloudflare secrets might not be set**
4. **GitHub repo info not configured in trigger endpoint**

## 🚀 Step-by-Step Fix

### 1. Apply D1 Database Migrations

```bash
# Make scripts executable
chmod +x scripts/migrate-d1.sh
chmod +x scripts/check-cloudflare-setup.sh

# Apply migrations
./scripts/migrate-d1.sh
```

### 2. Set Cloudflare Secrets

Set all required secrets in Cloudflare:

```bash
# Core Telegram API credentials
wrangler secret put TELEGRAM_API_ID
wrangler secret put TELEGRAM_API_HASH
wrangler secret put TELEGRAM_SESSION
wrangler secret put TELEGRAM_UPDATE_SECRET

# Channel configuration
wrangler secret put TELEGRAM_TRADING_CHANNELS
wrangler secret put TELEGRAM_AIRDROP_CHANNELS

# ImageKit for image storage
wrangler secret put IMAGEKIT_PRIVATE_KEY
wrangler secret put IMAGEKIT_URL_ENDPOINT

# Admin access
wrangler secret put ADMIN_SECRET

# Optional: GitHub integration for trigger endpoint
wrangler secret put GITHUB_REPO_OWNER
wrangler secret put GITHUB_REPO_NAME
wrangler secret put GITHUB_TOKEN
```

### 3. Verify GitHub Actions Secrets

Ensure these secrets are set in your GitHub repository settings:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH` 
- `TELEGRAM_SESSION`
- `TELEGRAM_UPDATE_SECRET`
- `TELEGRAM_TRADING_CHANNELS`
- `TELEGRAM_AIRDROP_CHANNELS`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_URL_ENDPOINT`

### 4. Test the Setup

```bash
# Check Cloudflare configuration
./scripts/check-cloudflare-setup.sh

# Test API endpoints
curl https://chainreads.pages.dev/api/telegram/trading
curl https://chainreads.pages.dev/api/telegram/airdrop

# Should return empty arrays [] if no data, or JSON error if setup issues
```

### 5. Trigger Data Fetch

Option A - Manual GitHub Actions trigger:
1. Go to your GitHub repository
2. Click "Actions" tab
3. Select "Update Telegram Data" workflow
4. Click "Run workflow"

Option B - API trigger (if configured):
```bash
curl -X POST https://chainreads.pages.dev/api/telegram/trigger \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_ADMIN_SECRET"}'
```

### 6. Verify Data Flow

After triggering the workflow:

1. **Check GitHub Actions logs** - Should show successful data fetch
2. **Check Cloudflare Pages logs** - Should show successful data upload
3. **Test API endpoints again** - Should return actual data

```bash
# Should now return actual posts
curl https://chainreads.pages.dev/api/telegram/trading
curl https://chainreads.pages.dev/api/telegram/airdrop
```

## 🔧 Common Issues & Solutions

### Issue: "Invalid secret" error
**Solution:** Ensure `TELEGRAM_UPDATE_SECRET` matches in both GitHub Actions and Cloudflare

### Issue: Empty arrays returned
**Possible causes:**
- D1 database not migrated
- GitHub Actions failing to fetch data
- Data upload failing due to missing secrets

### Issue: GitHub Actions failing
**Check:**
- All secrets are set in GitHub repository
- Telegram session is valid
- ImageKit credentials are correct

### Issue: Cloudflare Functions errors
**Check:**
- All secrets are set in Cloudflare
- D1 database exists and is migrated
- KV namespace exists

## 📊 Monitoring

### Check Data Freshness
```bash
# Check when data was last updated
curl https://chainreads.pages.dev/api/telegram/trading | jq '.[0].date'
```

### Check Database Directly
```bash
# Count posts in database
wrangler d1 execute chainreads-db --command="SELECT category, COUNT(*) FROM telegram_posts GROUP BY category;"

# Check latest posts
wrangler d1 execute chainreads-db --command="SELECT channel, date, text FROM telegram_posts ORDER BY date DESC LIMIT 5;"
```

## 🎯 Expected Behavior

Once fixed:
- GitHub Actions runs every 6 hours automatically
- Fetches ~20 posts per channel from configured Telegram channels
- Uploads images to ImageKit CDN
- Stores posts in Cloudflare D1 database
- API endpoints return fresh data with images
- Old posts are automatically cleaned up

## 🆘 Still Not Working?

1. **Check Cloudflare Pages deployment logs**
2. **Check GitHub Actions workflow logs**
3. **Verify all secrets are set correctly**
4. **Test with a manual workflow trigger**
5. **Check D1 database has data**: `wrangler d1 execute chainreads-db --command="SELECT COUNT(*) FROM telegram_posts;"`

The scraping system should work exactly as it did on Railway once all secrets are properly configured and the database is migrated.