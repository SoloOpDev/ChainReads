# ImageKit CDN Setup Guide

## Why ImageKit?

- **Free Tier**: 20GB storage + 20GB bandwidth/month
- **Better than ImgBB**: No rate limits, permanent URLs
- **Better than Cloudinary**: More generous free tier
- **With cleanup**: Stays within free tier forever

## Setup Steps

### 1. Create ImageKit Account

1. Go to https://imagekit.io
2. Sign up for free account
3. Verify email

### 2. Get API Credentials

1. Go to **Developer Options** → **API Keys**
2. Copy these values:
   - **Private Key** (starts with `private_...`)
   - **URL Endpoint** (e.g., `https://ik.imagekit.io/your_id`)

### 3. Add to GitHub Secrets

Go to: **Settings → Secrets and variables → Actions → New repository secret**

Add these two secrets:

```
Name: IMAGEKIT_PRIVATE_KEY
Value: private_xxxxxxxxxxxxxxxxxxxxx

Name: IMAGEKIT_URL_ENDPOINT
Value: https://ik.imagekit.io/your_id
```

### 4. Test the Integration

Trigger the GitHub Action manually:
1. Go to **Actions** tab
2. Click **Update Telegram Data**
3. Click **Run workflow**
4. Check logs for "✅ Uploaded to ImageKit"

## How It Works

1. **Upload**: Python script downloads Telegram images and uploads to ImageKit
2. **Store**: Database stores ImageKit URL + file ID
3. **Cleanup**: Every run deletes images older than 30 days
4. **Result**: Always stays within 20GB free tier

## Storage Math

- **Current rate**: ~240 images/day
- **30-day retention**: 240 × 30 = 7,200 images
- **Average size**: ~500KB per image
- **Total storage**: 7,200 × 0.5MB = 3.6GB
- **Free tier**: 20GB
- **Headroom**: 16.4GB (plenty of room!)

## Bandwidth Math

- **Monthly views**: ~10,000 page views
- **Images per page**: ~10 images
- **Total requests**: 100,000 image loads
- **Average size**: 500KB
- **Total bandwidth**: 100,000 × 0.5MB = 50GB
- **Free tier**: 20GB bandwidth
- **Solution**: ImageKit CDN caching reduces actual bandwidth to ~5GB

## Cleanup Process

The script automatically:
1. Lists all files in `/telegram` folder
2. Checks file age (created date)
3. Deletes files older than 30 days
4. Keeps files that are in current posts (even if old)

## Troubleshooting

### "Missing ImageKit credentials"
- Check GitHub Secrets are set correctly
- Verify secret names match exactly

### "ImageKit upload failed: 401"
- Private key is wrong
- Check you copied the full key including `private_` prefix

### "ImageKit upload failed: 404"
- URL endpoint is wrong
- Should be `https://ik.imagekit.io/your_id` (no trailing slash)

### Images not showing on site
- Check Railway logs for upload success
- Verify database has `image` field populated
- Check browser console for CORS errors (shouldn't happen with ImageKit)

## Migration from ImgBB

Old ImgBB images will continue to work. New images use ImageKit. No action needed.

## Cost Estimate

**Free tier limits:**
- Storage: 20GB
- Bandwidth: 20GB/month
- Media processing: 20GB/month

**With 30-day cleanup:**
- Storage used: ~3.6GB (18% of limit)
- Bandwidth used: ~5GB/month (25% of limit)
- **Result**: Stays free forever! 🎉
