# Cloudflare Migration Guide

## 🚀 Migration Steps

### 1. Install Dependencies
```bash
# Copy the new package.json
cp package-cloudflare.json package.json
npm install
```

### 2. Create Cloudflare Resources
```bash
# Create D1 database
wrangler d1 create chainreads-db

# Create KV namespace
wrangler kv:namespace create KV

# Create R2 bucket
wrangler r2 bucket create chainreads-images
```

### 3. Update wrangler.toml
Update the IDs in `wrangler.toml` with the ones from step 2:
- `database_id` from D1 create command
- `id` from KV create command

### 4. Set Environment Variables
```bash
# Set secrets
wrangler secret put CRYPTOPANIC_API_KEY
wrangler secret put TELEGRAM_API_ID
wrangler secret put TELEGRAM_API_HASH
wrangler secret put TELEGRAM_PHONE
wrangler secret put TELEGRAM_SESSION
wrangler secret put BACKEND_WALLET_PRIVATE_KEY
wrangler secret put ADMIN_SECRET
wrangler secret put VITE_CONTRACT_ADDRESS
wrangler secret put TELEGRAM_UPDATE_SECRET

# Set environment variables
wrangler secret put TELEGRAM_TRADING_CHANNELS
wrangler secret put TELEGRAM_AIRDROP_CHANNELS
```

### 5. Run Database Migrations
```bash
# Generate migration files
npm run d1:generate

# Apply migrations locally
npm run d1:migrate

# Apply migrations to production
npm run d1:migrate:prod
```

### 6. Build and Deploy
```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages
npm run deploy
```

## 🔄 Data Migration

### Export from PostgreSQL
```sql
-- Export users
COPY (SELECT * FROM users) TO '/tmp/users.csv' WITH CSV HEADER;

-- Export news_articles
COPY (SELECT * FROM news_articles) TO '/tmp/news_articles.csv' WITH CSV HEADER;

-- Export user_claims
COPY (SELECT * FROM user_claims) TO '/tmp/user_claims.csv' WITH CSV HEADER;

-- Export predictions
COPY (SELECT * FROM predictions) TO '/tmp/predictions.csv' WITH CSV HEADER;

-- Export telegram_posts
COPY (SELECT * FROM telegram_posts) TO '/tmp/telegram_posts.csv' WITH CSV HEADER;
```

### Import to D1
```bash
# Import data using wrangler
wrangler d1 execute chainreads-db --file=import-users.sql
wrangler d1 execute chainreads-db --file=import-articles.sql
# ... etc for each table
```

## 📁 File Structure Changes

### New Files Created:
- `wrangler.toml` - Cloudflare configuration
- `shared/schema-d1.ts` - SQLite schema for D1
- `server/db-d1.ts` - D1 database connection
- `server/storage-d1.ts` - D1 storage implementation
- `functions/_middleware.ts` - Cloudflare Pages middleware
- `functions/api/*.ts` - API endpoints as Cloudflare Functions
- `drizzle.config.d1.ts` - Drizzle config for D1
- `package-cloudflare.json` - Updated dependencies

### Files to Update:
- Update imports to use D1 schema and storage
- Replace Express routes with Cloudflare Functions
- Update GitHub Actions for Cloudflare deployment

## 🔧 Key Differences

### Database Changes:
- PostgreSQL → SQLite (D1)
- `gen_random_uuid()` → `nanoid()`
- `text[]` arrays → JSON strings
- `timestamp` → `integer` with timestamp mode
- Manual UPSERT handling (no native support)

### Runtime Changes:
- Express.js → Cloudflare Workers
- Node.js APIs → Web APIs
- File system → R2 storage
- Sessions → KV storage

### Deployment Changes:
- Railway → Cloudflare Pages
- Environment variables → Wrangler secrets
- PostgreSQL → D1 database

## 🎯 Benefits After Migration

- **100k requests/day** free tier
- **Global edge deployment** (300+ locations)
- **Zero cold starts**
- **Unlimited static bandwidth**
- **5GB database storage**
- **10GB R2 storage**
- **Better performance** worldwide

## 🚨 Important Notes

1. **Test thoroughly** - SQLite behaves differently than PostgreSQL
2. **Backup data** before migration
3. **Update API calls** if endpoints change
4. **Monitor limits** - D1 has query limits per invocation
5. **Session handling** - Implement KV-based sessions

## 📞 Support

If you encounter issues:
1. Check Cloudflare Workers docs
2. Review D1 limitations
3. Test with local development first
4. Use `wrangler tail` for debugging