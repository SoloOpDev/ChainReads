#!/usr/bin/env powershell

Write-Host "🔍 Checking Cloudflare Setup for Telegram Scraping" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Check if wrangler is installed
try {
    $null = Get-Command wrangler -ErrorAction Stop
    Write-Host "✅ Wrangler CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Wrangler CLI not found. Install with: npm install -g wrangler" -ForegroundColor Red
    exit 1
}

# Check D1 database
Write-Host ""
Write-Host "📊 Checking D1 Database..." -ForegroundColor Yellow
try {
    $dbInfo = wrangler d1 info chainreads-db 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ D1 database 'chainreads-db' exists" -ForegroundColor Green
    } else {
        Write-Host "❌ D1 database 'chainreads-db' not found" -ForegroundColor Red
        Write-Host "   Run: wrangler d1 create chainreads-db" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Error checking D1 database" -ForegroundColor Red
    exit 1
}

# Check if migrations are applied
Write-Host ""
Write-Host "🔄 Checking D1 Migrations..." -ForegroundColor Yellow
Write-Host "Listing tables in D1 database:"
wrangler d1 execute chainreads-db --command="SELECT name FROM sqlite_master WHERE type='table';"

Write-Host ""
Write-Host "Checking if telegram_posts table exists:"
wrangler d1 execute chainreads-db --command="SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='telegram_posts';"

# Check required secrets
Write-Host ""
Write-Host "🔐 Required Secrets Checklist:" -ForegroundColor Yellow
$requiredSecrets = @(
    "TELEGRAM_API_ID",
    "TELEGRAM_API_HASH", 
    "TELEGRAM_SESSION",
    "TELEGRAM_UPDATE_SECRET",
    "TELEGRAM_TRADING_CHANNELS",
    "TELEGRAM_AIRDROP_CHANNELS",
    "IMAGEKIT_PRIVATE_KEY",
    "IMAGEKIT_URL_ENDPOINT",
    "ADMIN_SECRET"
)

foreach ($secret in $requiredSecrets) {
    Write-Host "   📝 Required: $secret" -ForegroundColor White
}

Write-Host ""
Write-Host "⚠️  To set secrets, run:" -ForegroundColor Yellow
Write-Host "   wrangler secret put TELEGRAM_API_ID" -ForegroundColor White
Write-Host "   wrangler secret put TELEGRAM_API_HASH" -ForegroundColor White
Write-Host "   wrangler secret put TELEGRAM_SESSION" -ForegroundColor White
Write-Host "   wrangler secret put TELEGRAM_UPDATE_SECRET" -ForegroundColor White
Write-Host "   wrangler secret put TELEGRAM_TRADING_CHANNELS" -ForegroundColor White
Write-Host "   wrangler secret put TELEGRAM_AIRDROP_CHANNELS" -ForegroundColor White
Write-Host "   wrangler secret put IMAGEKIT_PRIVATE_KEY" -ForegroundColor White
Write-Host "   wrangler secret put IMAGEKIT_URL_ENDPOINT" -ForegroundColor White
Write-Host "   wrangler secret put ADMIN_SECRET" -ForegroundColor White

# Check GitHub Actions secrets
Write-Host ""
Write-Host "🐙 GitHub Actions Requirements:" -ForegroundColor Yellow
Write-Host "   Make sure these secrets are set in your GitHub repository:" -ForegroundColor White
Write-Host "   - TELEGRAM_API_ID" -ForegroundColor White
Write-Host "   - TELEGRAM_API_HASH" -ForegroundColor White
Write-Host "   - TELEGRAM_SESSION" -ForegroundColor White
Write-Host "   - TELEGRAM_UPDATE_SECRET" -ForegroundColor White
Write-Host "   - TELEGRAM_TRADING_CHANNELS" -ForegroundColor White
Write-Host "   - TELEGRAM_AIRDROP_CHANNELS" -ForegroundColor White
Write-Host "   - IMAGEKIT_PRIVATE_KEY" -ForegroundColor White
Write-Host "   - IMAGEKIT_URL_ENDPOINT" -ForegroundColor White

Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Green
Write-Host "1. Run D1 migrations if telegram_posts table doesn't exist:" -ForegroundColor White
Write-Host "   wrangler d1 migrations apply chainreads-db --local" -ForegroundColor Gray
Write-Host "   wrangler d1 migrations apply chainreads-db" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Test the API endpoints:" -ForegroundColor White
Write-Host "   curl https://chainreads.pages.dev/api/telegram/trading" -ForegroundColor Gray
Write-Host "   curl https://chainreads.pages.dev/api/telegram/airdrop" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Manually trigger GitHub Actions workflow to test scraping" -ForegroundColor White
Write-Host ""
Write-Host "4. Check Cloudflare Pages deployment logs for any errors" -ForegroundColor White

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "✅ Setup check complete!" -ForegroundColor Green