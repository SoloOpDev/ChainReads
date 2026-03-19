# Cloudflare Pages Functions Not Deploying - FIX

## Problem
Cloudflare Pages is deploying static files but NOT deploying Functions. Build shows "1922 files uploaded" but zero Functions included.

## Root Cause
**Root directory setting in Cloudflare Pages dashboard is likely set to `/client` instead of `/` (project root).**

When Root directory is `/client`, Cloudflare looks for:
- Build output: `/client/dist/public` ✅ (works)
- Functions: `/client/functions` ❌ (doesn't exist)

But your actual structure is:
- Build output: `/dist/public` ✅
- Functions: `/functions` ✅

## Solution

### Step 1: Fix Cloudflare Pages Settings
1. Go to Cloudflare Dashboard
2. Navigate to: Workers & Pages → chainreads → Settings → Builds & deployments
3. Click "Edit configuration" or "Configure Production deployments"
4. Set these values:
   - **Root directory**: `/` (or leave empty)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist/public`
5. Save changes

### Step 2: Trigger New Deployment
After saving settings, trigger a new deployment:
- Push a commit to GitHub, OR
- Go to Deployments tab → "Retry deployment"

### Step 3: Verify Functions Deploy
After deployment completes, check:
1. Deployment details should show "Functions" section with your endpoints
2. Visit: `https://your-domain.pages.dev/api/health` - should return JSON
3. Wallet connect should work: `/api/wallet/connect`

## Current Project Structure (Correct)
```
/
├── functions/              ← Functions at ROOT (correct)
│   ├── _middleware.ts
│   └── api/
│       ├── wallet/
│       │   ├── connect.ts
│       │   ├── disconnect.ts
│       │   └── profile.ts
│       ├── claim-points.ts
│       └── ...
├── client/                 ← React app source
│   ├── src/
│   └── public/
│       ├── _routes.json    ← Routes /api/* to Functions
│       └── _headers
├── dist/
│   └── public/             ← Build output (Vite builds here)
├── wrangler.toml           ← pages_build_output_dir = "dist/public"
└── package.json
```

## Why This Happens
Cloudflare Pages expects this structure:
- `/functions/` at project root for Functions
- Build output directory relative to root directory setting

If root directory = `/client`, Cloudflare looks for `/client/functions/` which doesn't exist.

## Verification Commands
After fixing, verify locally:
```bash
# Build the project
npm run build

# Check Functions exist
ls -la functions/api/wallet/

# Check build output
ls -la dist/public/

# Test locally with wrangler
npm run dev
```

## Expected Deployment Output
After fix, deployment should show:
```
✅ 1922 files uploaded
✅ 15+ Functions deployed:
   - /api/wallet/connect
   - /api/wallet/disconnect
   - /api/wallet/profile
   - /api/claim-points
   - /api/claim-status
   - ... (all your Functions)
```

## If Still Not Working
1. Check wrangler.toml has: `pages_build_output_dir = "dist/public"`
2. Verify _routes.json exists in `client/public/_routes.json`
3. Check Functions syntax - must export `onRequest` or `onRequestGet/Post/etc`
4. Look at build logs for any Function compilation errors
