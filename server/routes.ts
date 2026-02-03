import express from 'express';
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { insertUserClaimSchema } from "../shared/schema.js";
import { z } from "zod";
import { fetchCoinDeskRSS } from "./rss.js";
import { extractHtmlFromArticlePageCached, normalizeUrl, clearCache, getCachedExtraction } from "./lib/extractor.js";
import Parser from 'rss-parser';
import type { CachedNews, RSSFeed, RSSItem } from './types/news.js';
import { 
  normalizeAddress, 
  isValidEthereumAddress, 
  requireWalletAuth,
  requireWalletHistory,
  checkWalletHistory
} from "./auth.js";
import { handleError, asyncHandler, safeLog } from "./error-handler.js";
import { createRateLimiter, createWalletRateLimiter, globalRateLimiter } from "./middleware/rate-limiter.js";
import { auditLogger, getAuditStats } from "./middleware/audit-logger.js";
import crypto from 'crypto';

// Rate limiters
const newsLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 20 }); // 20 requests per minute
const scrapeLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 10 }); // 10 requests per minute
const exchangeSignLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 5 }); // 5 requests per minute
const walletRateLimiter = createWalletRateLimiter(60 * 1000, 20); // 20 requests per minute per wallet

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply global rate limiter to all routes
  app.use('/api', globalRateLimiter);
  
  let cachedNews: CachedNews | null = null;
  let lastFetchTime = 0;
  const FETCH_INTERVAL = 10 * 60 * 1000; // 10 minutes
  
  // Metrics
  let cacheHits = 0;
  let cacheMisses = 0;
  let fetchErrors = 0;
  
  // Pre-scraping state
  let isPreScraping = false;
  let preScrapeProgress = { current: 0, total: 0 };
  
  async function getCachedRSS(): Promise<CachedNews> {
    const now = Date.now();
    if (!cachedNews || now - lastFetchTime > FETCH_INTERVAL) {
      try {
        cacheMisses++;
        cachedNews = await fetchCoinDeskRSS();
        lastFetchTime = now;
        console.log('[CACHE] RSS cache refreshed');
        
        // Trigger background pre-scraping (don't await)
        preScrapeArticles(cachedNews).catch(err => {
          console.error('[PRE-SCRAPE] Background scraping failed:', err);
        });
      } catch (error) {
        fetchErrors++;
        console.error('[CACHE] Failed to refresh RSS cache:', error);
        // Keep old cache if fetch fails
        if (!cachedNews) {
          throw new Error('Failed to fetch news and no cached data available');
        }
        console.log('[CACHE] Using stale cache due to fetch error');
      }
    } else {
      cacheHits++;
    }
    return cachedNews;
  }
  
  // Pre-scrape articles in background to populate cache
  async function preScrapeArticles(newsData: CachedNews) {
    if (isPreScraping) {
      console.log('[PRE-SCRAPE] Already scraping, skipping...');
      return;
    }
    
    isPreScraping = true;
    const articles = newsData.results.filter(a => a.source?.domain === 'coindesk.com' && a.original_url);
    preScrapeProgress = { current: 0, total: articles.length };
    
    console.log(`[PRE-SCRAPE] 🚀 Starting background scraping of ${articles.length} articles...`);
    
    // Scrape in batches of 3 with delays to avoid overwhelming the server
    const BATCH_SIZE = 3;
    const BATCH_DELAY = 2000; // 2 seconds between batches
    
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async (article) => {
          try {
            // Check if already cached
            const cached = getCachedExtraction(article.original_url);
            if (cached?.html && cached.html.length > 500) {
              preScrapeProgress.current++;
              return; // Already cached
            }
            
            // Scrape and cache
            await extractHtmlFromArticlePageCached(article.original_url);
            preScrapeProgress.current++;
            console.log(`[PRE-SCRAPE] ✅ ${preScrapeProgress.current}/${preScrapeProgress.total} - ${article.title?.substring(0, 50)}...`);
          } catch (error) {
            preScrapeProgress.current++;
            console.log(`[PRE-SCRAPE] ⚠️ ${preScrapeProgress.current}/${preScrapeProgress.total} - Failed: ${article.title?.substring(0, 50)}...`);
          }
        })
      );
      
      // Delay between batches (except for last batch)
      if (i + BATCH_SIZE < articles.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    
    console.log(`[PRE-SCRAPE] 🎉 Completed! Scraped ${preScrapeProgress.current}/${preScrapeProgress.total} articles`);
    isPreScraping = false;
  }
  
  const parser = new Parser({ customFields: { item: ['content:encoded'] } });
  let cachedRSSFeed: RSSFeed | null = null;
  let lastRSSFetch = 0;
  const RSS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  
  async function getCachedRSSFeed(): Promise<RSSFeed> {
    const now = Date.now();
    if (!cachedRSSFeed || now - lastRSSFetch > RSS_CACHE_TTL) {
      try {
        const feed = await parser.parseURL('https://www.coindesk.com/arc/outboundfeeds/rss/');
        cachedRSSFeed = feed as RSSFeed;
        lastRSSFetch = now;
      } catch (error) {
        console.error('[CACHE] Failed to refresh RSS feed cache:', error);
        if (!cachedRSSFeed) {
          throw new Error('Failed to fetch RSS feed and no cached data available');
        }
      }
    }
    return cachedRSSFeed;
  }

  // Metrics endpoint
  app.get("/api/metrics", (_req, res) => {
    const totalRequests = cacheHits + cacheMisses;
    const auditStats = getAuditStats();
    
    res.json({
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: totalRequests > 0 ? (cacheHits / totalRequests * 100).toFixed(2) + '%' : 'N/A',
      },
      preScrape: {
        inProgress: isPreScraping,
        progress: preScrapeProgress,
        percentage: preScrapeProgress.total > 0 
          ? ((preScrapeProgress.current / preScrapeProgress.total) * 100).toFixed(1) + '%'
          : 'N/A',
      },
      audit: auditStats,
      errors: fetchErrors,
      uptime: process.uptime(),
    });
  });

  // Clear user claims - useful for testing
  app.post("/api/clear-claims", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      
      if (walletAddress) {
        const normalizedAddress = normalizeAddress(walletAddress);
        const user = await storage.getUserByUsername(normalizedAddress);
        
        if (user) {
          const allClaims = await storage.getUserClaims(user.id);
          await storage.clearUserClaims(user.id);
          console.log(`[CLEAR-CLAIMS] Cleared ${allClaims.length} claims for user: ${user.id}`);
          
          res.json({ success: true, message: `Claims cleared for ${walletAddress}`, count: allClaims.length });
        } else {
          res.json({ success: false, message: `User not found for ${walletAddress}` });
        }
      } else {
        res.json({ success: false, message: 'Wallet address required' });
      }
    } catch (error) {
      console.error('Error clearing claims:', error);
      res.status(500).json({ error: 'Failed to clear claims' });
    }
  });

  // Clear all caches - useful for testing
  app.post("/api/clear-cache", (_req, res) => {
    cachedNews = null;
    lastFetchTime = 0;
    cachedRSSFeed = null;
    lastRSSFetch = 0;
    clearCache(); // Clear article content cache
    console.log('[CACHE] All caches cleared');
    res.json({ success: true, message: 'All caches cleared' });
  });

  // Clear IP bindings - useful for testing
  app.post("/api/clear-ip-bindings", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      
      if (walletAddress) {
        // Clear bindings for specific wallet
        await storage.clearIpBindingsForWallet(walletAddress);
        console.log(`[IP] Cleared bindings for wallet: ${walletAddress}`);
        res.json({ success: true, message: `IP bindings cleared for ${walletAddress}` });
      } else {
        // Clear all bindings (admin only - be careful!)
        await storage.clearAllIpBindings();
        console.log('[IP] Cleared ALL IP bindings');
        res.json({ success: true, message: 'All IP bindings cleared' });
      }
    } catch (error) {
      console.error('Error clearing IP bindings:', error);
      res.status(500).json({ error: 'Failed to clear IP bindings' });
    }
  });

  // Grant points to wallet - ADMIN ONLY (for initial setup/rewards)
  app.post("/api/admin/grant-points", async (req, res) => {
    try {
      const { walletAddress, points, adminSecret } = req.body;
      
      // Verify admin secret
      const expectedSecret = process.env.ADMIN_SECRET || 'change-me-in-production';
      if (!adminSecret || adminSecret !== expectedSecret) {
        console.log('[ADMIN] Unauthorized grant attempt');
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!walletAddress || !points) {
        return res.status(400).json({ error: "Wallet address and points required" });
      }
      
      if (typeof points !== 'number' || points <= 0) {
        return res.status(400).json({ error: "Points must be a positive number" });
      }
      
      if (points > 100000) {
        return res.status(400).json({ error: "Maximum 100,000 points per grant" });
      }
      
      const normalizedAddress = normalizeAddress(walletAddress);
      
      // Get or create user
      let user = await storage.getUserByUsername(normalizedAddress);
      if (!user) {
        user = await storage.createUser({
          username: normalizedAddress,
          password: 'wallet-auth',
        });
        await storage.updateUserTokens(user.id, 0, 0);
        user = await storage.getUserByUsername(normalizedAddress);
      }
      
      if (!user) {
        return res.status(500).json({ error: "Failed to create user" });
      }
      
      // Grant points
      const newBalance = (user.tokenBalance || 0) + points;
      await storage.updateUserTokens(user.id, newBalance, user.dailyClaims);
      
      console.log(`[ADMIN] Granted ${points} points to ${walletAddress}. New balance: ${newBalance}`);
      
      res.json({
        success: true,
        walletAddress: normalizedAddress,
        pointsGranted: points,
        newBalance,
        message: `Successfully granted ${points} points`
      });
    } catch (error) {
      console.error('[ADMIN] Error granting points:', error);
      res.status(500).json({ error: 'Failed to grant points' });
    }
  });

  app.get("/api/news", newsLimiter, async (_req, res) => {
    try {
      const data = await getCachedRSS();
      res.set('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
      res.json(data);
    } catch (error) {
      console.error("Error fetching news:", error);
      res.status(500).json({ 
        message: "Failed to fetch news articles",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Scrape endpoint - extract article content from URL
  console.log('[ROUTES] Registering /api/scrape endpoint');
  app.get("/api/scrape", scrapeLimiter, async (req, res) => {
    try {
      console.log('[SCRAPE] Request received:', req.query);
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      const targetUrl = String(url);
      if (!targetUrl.includes('coindesk.com')) {
        return res.status(400).json({ error: 'Only CoinDesk articles are supported' });
      }

      // Try RSS feed first
      const feed = await getCachedRSSFeed();
      const normalizedTargetUrl = normalizeUrl(targetUrl);
      
      const rssItem = feed.items.find((item: RSSItem) => {
        const normalizedItemUrl = normalizeUrl(item.link || '');
        return normalizedItemUrl === normalizedTargetUrl || normalizedTargetUrl.startsWith(normalizedItemUrl);
      });

      if (rssItem && rssItem['content:encoded'] && rssItem['content:encoded'].length > 200) {
        res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        return res.json({ content: rssItem['content:encoded'], contentLength: rssItem['content:encoded'].length, strategy: 'rss' });
      }

      // Fallback to direct scraping
      console.log(`RSS content not found for ${targetUrl}. Scraping directly.`);
      const page = await extractHtmlFromArticlePageCached(targetUrl);
      console.log(`Scrape success: ${page.meta.textLen} chars`);
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
      return res.json({ content: page.html, contentLength: page.meta.textLen, strategy: page.meta.strategy });

    } catch (error: any) {
      console.error('Scrape error:', error.message);
      res.status(500).json({ error: 'Failed to fetch article content', message: error.message });
    }
  });

  app.get("/api/article/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[API /article/:id] Looking for article with ID: ${id}`);
      
      // Handle academic articles
      if (id.startsWith('academic-')) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const guidesPath = path.join(process.cwd(), 'coingecko-guides.json');
        
        try {
          const data = await fs.readFile(guidesPath, 'utf-8');
          const guides = JSON.parse(data);
          const guidesArray = Array.isArray(guides) ? guides : (guides.guides || []);
          const article = guidesArray.find((g: any) => g.id === id);
          
          if (!article) {
            console.log(`[API /article/:id] Academic article not found: ${id}`);
            return res.status(404).json({ message: "Academic article not found" });
          }
          
          console.log(`[API /article/:id] Found academic article: ${article.title}`);
          res.set('Cache-Control', 'public, max-age=3600');
          return res.json({
            ...article,
            content: article.fullContent || article.description || '',
            contentStrategy: 'academic'
          });
        } catch (err) {
          console.error('[API /article/:id] Error reading academic articles:', err);
          return res.status(500).json({ message: "Failed to load academic article" });
        }
      }
      
      // Handle regular news articles
      const articleIndex = parseInt(id, 10) - 1;
      if (isNaN(articleIndex) || articleIndex < 0) {
        return res.status(400).json({ message: "Invalid article ID" });
      }

      const rssData = await getCachedRSS();
      const article = rssData.results[articleIndex];
      
      if (!article) {
        console.log(`Article not found at index: ${articleIndex}`);
        return res.status(404).json({ message: "Article not found" });
      }
      
      console.log(`[API /article/:id] Found article: ${article.title}`);
      console.log(`[API /article/:id] Article data:`, {
        id: article.id,
        hasContent: !!article.content,
        contentLength: article.content?.length || 0,
        source: article.source,
        original_url: article.original_url
      });

      // Return article with content immediately if available (must be substantial - 500+ chars)
      if (article.content && article.content.length > 500) {
        console.log(`[API /article/:id] ✅ Returning article with RSS content (${article.content.length} chars) - NO SCRAPING NEEDED`);
        res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        return res.json({
          ...article,
          contentStrategy: 'rss-direct'
        });
      }

      if (article.source?.domain === 'coindesk.com' && article.original_url) {
        try {
          console.log(`[API /article/:id] Scraping full content from: ${article.original_url}`);
          
          const page = await extractHtmlFromArticlePageCached(article.original_url);
          console.log(`[API /article/:id] Successfully scraped content (${page.meta.textLen} chars)`);
          res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
          
          // don't spread article first, it overwrites content
          const { content: _, ...articleWithoutContent } = article;
          return res.json({
            ...articleWithoutContent,
            content: page.html,
            contentStrategy: page.meta.strategy
          });
        } catch (scrapeError) {
          console.error("Error fetching full content:", scrapeError);
        }
      }

      res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
      res.json({
        ...article,
        content: article.description || '',
        contentStrategy: 'rss-fallback'
      });
    } catch (error) {
      console.error("Error fetching article content:", error);
      res.status(500).json({ message: "Failed to fetch article content" });
    }
  });

  app.get("/api/user/profile", async (_req, res) => {
    try {
      const user = await storage.getUser("default-user");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const today = new Date();
      const lastClaimDate = user.lastClaimDate;
      
      if (lastClaimDate) {
        const lastClaimDay = new Date(lastClaimDate);
        lastClaimDay.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        
        if (today.getTime() > lastClaimDay.getTime()) {
          await storage.resetDailyClaims(user.id);
          const updatedUser = await storage.getUser(user.id);
          return res.json(updatedUser);
        }
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  app.get("/api/user/claims", async (req, res) => {
    try {
      const walletAddress = normalizeAddress(req.headers['x-wallet-address'] as string);
      
      console.log('📜 [CLAIMS-HISTORY] Request for wallet:', walletAddress);
      
      if (!walletAddress) {
        console.log('❌ [CLAIMS-HISTORY] No wallet address');
        return res.json([]); // Return empty array if no wallet
      }
      
      // Get user by wallet address
      const user = await storage.getUserByUsername(walletAddress);
      if (!user) {
        console.log('❌ [CLAIMS-HISTORY] User not found');
        return res.json([]); // Return empty array if user doesn't exist
      }
      
      console.log('👤 [CLAIMS-HISTORY] User found:', user.id);
      
      const claims = await storage.getUserClaims(user.id);
      
      console.log('📋 [CLAIMS-HISTORY] Found claims:', claims.length);
      
      // Sort by date (newest first)
      claims.sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
      
      res.json(claims);
    } catch (error) {
      console.error("Error fetching user claims:", error);
      res.status(500).json({ message: "Failed to fetch user claims" });
    }
  });

  app.post("/api/user/claim", async (req, res) => {
    try {
      const claimData = insertUserClaimSchema.parse(req.body);
      const userId = "default-user";
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const today = new Date();
      const dailyClaims = await storage.getUserDailyClaims(userId, today);
      
      if (dailyClaims.length >= 3) {
        return res.status(400).json({ message: "Daily claim limit reached" });
      }

      const existingClaim = await storage.getUserClaimForArticle(userId, claimData.articleId);
      if (existingClaim) {
        return res.status(400).json({ message: "Already claimed for this article" });
      }

      const claim = await storage.createUserClaim({
        ...claimData,
        userId,
      });

      const newBalance = user.tokenBalance + claimData.tokensEarned;
      const newDailyClaims = user.dailyClaims + 1;
      
      await storage.updateUserTokens(userId, newBalance, newDailyClaims);

      res.json({ 
        claim,
        newBalance,
        dailyClaims: newDailyClaims,
        message: "Tokens claimed successfully"
      });
    } catch (error) {
      console.error("Error claiming tokens:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to claim tokens" });
    }
  });

  // Telegram fetch trigger endpoint (disabled on Railway - use GitHub Actions)
  app.post("/api/telegram/refresh", async (_req, res) => {
    res.status(501).json({ 
      error: "Manual refresh not available",
      message: "Telegram data is automatically updated every 6 hours via GitHub Actions"
    });
  });

  // Telegram API endpoint to update telegram data (called by GitHub Actions)
  // SECURITY: Validates secret, request size, and required fields
  app.post("/api/telegram/update", async (req, res) => {
    try {
      const { posts, secret } = req.body;
      
      // Validate secret
      if (!secret || secret !== process.env.TELEGRAM_UPDATE_SECRET) {
        console.log('[TELEGRAM-UPDATE] Unauthorized attempt');
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Validate posts data
      if (!posts || !Array.isArray(posts)) {
        return res.status(400).json({ error: "Invalid posts data" });
      }
      
      // Validate post size (prevent abuse)
      if (posts.length > 200) {
        return res.status(400).json({ error: "Too many posts (max 200)" });
      }
      
      // Validate each post has required fields
      for (const post of posts) {
        if (!post.messageId || !post.channel || !post.category || !post.text || !post.date) {
          return res.status(400).json({ error: "Missing required fields in post" });
        }
        
        // Validate imageData size (max 2MB per image)
        if (post.imageData && post.imageData.length > 2 * 1024 * 1024 * 1.33) { // 2MB * 1.33 for base64
          console.log(`[TELEGRAM-UPDATE] Image too large for post ${post.messageId}, skipping imageData`);
          post.imageData = null; // Skip large images
        }
      }
      
      console.log(`[TELEGRAM-UPDATE] Updating ${posts.length} posts...`);
      
      const inserted = await storage.upsertTelegramPosts(posts);
      
      console.log(`[TELEGRAM-UPDATE] Successfully updated ${inserted} posts`);
      
      res.json({ 
        success: true,
        message: `Updated ${inserted} telegram posts`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[TELEGRAM-UPDATE] Error:", error);
      res.status(500).json({ error: "Failed to update telegram data" });
    }
  });

  // Telegram API endpoints - read from database with caching
  app.get("/api/telegram/trading", async (_req, res) => {
    try {
      const posts = await storage.getTelegramPosts('trading', 100);
      
      // Convert imageData to data URLs for frontend
      const postsWithImages = posts.map(post => ({
        ...post,
        image: post.imageData ? `data:image/jpeg;base64,${post.imageData}` : post.image,
        imageData: undefined // Don't send raw base64 twice
      }));
      
      res.set('Cache-Control', 'public, max-age=900, s-maxage=900'); // Cache 15 min
      res.json({
        posts: postsWithImages,
        fetchedAt: new Date().toISOString(),
        totalPosts: postsWithImages.length
      });
    } catch (error) {
      console.error("Error fetching trading signals:", error);
      res.status(500).json({ message: "Failed to fetch trading signals" });
    }
  });

  app.get("/api/telegram/airdrop", async (_req, res) => {
    try {
      const posts = await storage.getTelegramPosts('airdrop', 100);
      
      // Convert imageData to data URLs for frontend
      const postsWithImages = posts.map(post => ({
        ...post,
        image: post.imageData ? `data:image/jpeg;base64,${post.imageData}` : post.image,
        imageData: undefined // Don't send raw base64 twice
      }));
      
      res.set('Cache-Control', 'public, max-age=900, s-maxage=900'); // Cache 15 min
      res.json({
        posts: postsWithImages,
        fetchedAt: new Date().toISOString(),
        totalPosts: postsWithImages.length
      });
    } catch (error) {
      console.error("Error fetching airdrop signals:", error);
      res.status(500).json({ message: "Failed to fetch airdrop signals" });
    }
  });

  // Points API endpoint
  app.get("/api/points/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = normalizeAddress(address);
      console.log('💰 [POINTS] Request for address:', address, '→', normalizedAddress);
      
      const user = await storage.getUserByUsername(normalizedAddress);
      console.log('👤 [POINTS] User found:', user ? `Yes (balance: ${user.tokenBalance})` : 'No');
      
      if (!user) {
        console.log('❌ [POINTS] No user found, returning 0');
        return res.json({
          totalPoints: 0,
          articlesRead: 0,
          claimsToday: 0
        });
      }

      const today = new Date();
      const dailyClaims = await storage.getUserDailyClaims(user.id, today);
      
      const response = {
        totalPoints: user.tokenBalance,
        articlesRead: user.dailyClaims,
        claimsToday: dailyClaims.length
      };
      
      console.log('📤 [POINTS] Sending response:', response);
      res.json(response);
    } catch (error) {
      console.error("Error fetching points:", error);
      res.status(500).json({ message: "Failed to fetch points" });
    }
  });

  // Academic API endpoint
  app.get("/api/academic", async (_req, res) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Generate academic articles from CoinGecko guides
      const guidesPath = path.join(process.cwd(), 'coingecko-guides.json');
      console.log('[ACADEMIC API] Reading from:', guidesPath);
      let guides: any[] = [];
      
      try {
        const data = await fs.readFile(guidesPath, 'utf-8');
        console.log('[ACADEMIC API] File read, length:', data.length);
        const guidesData = JSON.parse(data);
        console.log('[ACADEMIC API] Parsed data type:', Array.isArray(guidesData) ? 'array' : typeof guidesData);
        console.log('[ACADEMIC API] Data keys:', Object.keys(guidesData).slice(0, 5));
        // Handle both array format and {guides: []} format
        guides = Array.isArray(guidesData) ? guidesData : (guidesData.guides || []);
        console.log('[ACADEMIC API] Guides count:', guides.length);
        if (guides.length > 0) {
          console.log('[ACADEMIC API] First guide:', guides[0].title);
        }
      } catch (err) {
        console.error('[ACADEMIC API] Error reading file:', err);
        console.log('[ACADEMIC API] No guides cache found, using fallback data');
      }

      const articles = guides.slice(0, 50).map((guide: any, index: number) => ({
        id: guide.id || `academic-${index + 1}`,
        title: guide.title || 'Crypto Guide',
        description: guide.description || guide.title || 'Learn about cryptocurrency',
        image: guide.image || `https://images.unsplash.com/photo-${1518546305927 + index}?w=400&h=250&fit=crop`,
        category: guide.category || 'Guide',
        readTime: guide.readTime || `${Math.floor(Math.random() * 10) + 5} min read`,
      }));

      console.log('[ACADEMIC API] Returning articles count:', articles.length);
      res.set('Cache-Control', 'public, max-age=600');
      res.json({ articles });
    } catch (error) {
      console.error("[ACADEMIC API] Error fetching academic articles:", error);
      res.status(500).json({ message: "Failed to fetch academic articles" });
    }
  });

  // Wallet connect endpoint
  app.post("/api/wallet/connect", async (req, res) => {
    try {
      const { address } = req.body;
      
      console.log('🔌 [CONNECT] Wallet connect request for:', address);
      
      if (!address) {
        return res.status(400).json({ message: "Wallet address required" });
      }

      // Normalize to lowercase for DB lookup
      const normalizedAddress = address.toLowerCase();
      console.log('🔄 [CONNECT] Normalized address:', normalizedAddress);

      // FIX: Use getUserByUsername since address is stored as username
      let user = await storage.getUserByUsername(normalizedAddress);
      console.log('👤 [CONNECT] User found:', user ? `Yes (balance: ${user.tokenBalance})` : 'No');
      
      if (!user) {
        console.log('➕ [CONNECT] Creating new user');
        user = await storage.createUser({
          username: normalizedAddress,
          password: 'wallet-auth',
        });
        // FIX: Use user.id instead of address for updateUserTokens
        await storage.updateUserTokens(user.id, 0, 0);
        user = await storage.getUserByUsername(normalizedAddress);
        console.log('✅ [CONNECT] New user created with balance:', user?.tokenBalance);
      }

      // Check IP binding for predictions
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                       req.socket.remoteAddress || 
                       'unknown';

      console.log('🔒 [CONNECT] Checking IP binding for:', clientIp);
      
      const existingBinding = await storage.getIpBinding(clientIp, 'predictions');
      
      if (existingBinding && existingBinding.walletAddress !== address) {
        console.log('❌ [CONNECT] IP already bound to different wallet');
        return res.status(403).json({ 
          message: "This IP address is already being used by another wallet. Please use a different device or contact support.",
          ipBound: true,
        });
      }

      // Create binding if it doesn't exist
      if (!existingBinding) {
        await storage.createIpBinding({
          ipAddress: clientIp,
          bindingType: 'predictions',
          walletAddress: address,
        });
        console.log('🔗 [CONNECT] Created IP binding');
      }

      const response = {
        walletAddress: normalizedAddress,
        tokenBalance: user?.tokenBalance || 0,
        ipBound: true,
      };
      
      console.log('📤 [CONNECT] Sending response:', response);
      res.json(response);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      res.status(500).json({ message: "Failed to connect wallet" });
    }
  });

  // Wallet disconnect endpoint
  app.post("/api/wallet/disconnect", async (req, res) => {
    try {
      res.json({ message: "Wallet disconnected successfully" });
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
      res.status(500).json({ message: "Failed to disconnect wallet" });
    }
  });

  // Claim points endpoint (section-based claiming) - REQUIRES WALLET AUTH
  app.post("/api/claim-points", requireWalletAuth, walletRateLimiter, auditLogger('CLAIM_SECTION'), asyncHandler(async (req, res) => {
    const { section } = req.body;
    
    if (typeof section !== 'string' || !['trading', 'airdrop'].includes(section)) {
      return res.status(400).json({ error: "Invalid section" });
    }
    
    const walletAddress = req.walletAddress!; // Set by requireWalletAuth middleware

    // Check wallet transaction history (min 5 transactions)
    const historyCheck = await checkWalletHistory(walletAddress, 5);
    if (!historyCheck.valid) {
      return res.status(403).json({ 
        error: "Wallet requirements not met",
        details: historyCheck.error,
        txCount: historyCheck.txCount,
        required: 5
      });
    }

    let user = await storage.getUserByUsername(walletAddress);
    if (!user) {
      user = await storage.createUser({
        username: walletAddress,
        password: 'wallet-auth',
      });
      await storage.updateUserTokens(user.id, 0, 0);
      user = await storage.getUserByUsername(walletAddress);
      
      if (!user) {
        return res.status(500).json({ error: "Failed to create user" });
      }
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    safeLog('IP-BINDING', `Checking for section: ${section}`);

    const existingBinding = await storage.getIpBinding(clientIp, section);
    if (existingBinding) {
      const boundWallet = normalizeAddress(existingBinding.walletAddress);
      const currentWallet = normalizeAddress(walletAddress);
      
      if (boundWallet !== currentWallet) {
        safeLog('IP-BINDING', 'IP already used by different wallet - BLOCKED');
        return res.status(403).json({ 
          error: "This IP address is already being used by another wallet. Each IP can only be used by one wallet."
        });
      }
    }
    
    // max 5 IPs per wallet
    const walletBindings = await storage.getWalletBindings(walletAddress, section);
    
    if (walletBindings.length >= 5) {
      const ipAlreadyBound = walletBindings.some(b => b.ipAddress === clientIp);
      
      if (!ipAlreadyBound) {
        safeLog('IP-BINDING', 'Wallet already has 5 IPs - BLOCKED');
        return res.status(403).json({ 
          error: "Your wallet is already registered with 5 different IPs (max limit). Please use one of your existing devices."
        });
      }
    }

    const now = new Date();
    const utcDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));
    const articleId = `${section}-${utcDate.toISOString().split('T')[0]}`;
    
    const existingClaim = await storage.getUserClaimForArticle(user.id, articleId);
    
    if (existingClaim) {
      return res.status(400).json({ error: "You have already claimed points for this section today" });
    }

    const pointsEarned = 35;
    
    await storage.createUserClaim({
      userId: user.id,
      articleId,
      tokensEarned: pointsEarned,
    });

    // Update user balance
    const newBalance = (user.tokenBalance || 0) + pointsEarned;
    await storage.updateUserTokens(user.id, newBalance, (user.dailyClaims || 0) + 1);

    // Only create IP binding AFTER all operations succeed
    if (!existingBinding) {
      await storage.createIpBinding({
        ipAddress: clientIp,
        bindingType: section,
        walletAddress: normalizeAddress(walletAddress),
      });
    }

    // Get today's claims for all sections
    const todayClaims = await storage.getUserDailyClaims(user.id, utcDate);
    const claimedSections = {
      news: todayClaims.some(c => c.articleId.startsWith('news-')),
      trading: todayClaims.some(c => c.articleId.startsWith('trading-')),
      airdrop: todayClaims.some(c => c.articleId.startsWith('airdrop-')),
    };

    res.json({
      pointsEarned,
      newBalance,
      claimedSections,
      totalToday: todayClaims.length,
      walletAddress,
    });
  }));

  // News article claim endpoint (individual articles, 10 points each, max 3 per day) - REQUIRES WALLET AUTH
  app.post("/api/news/claim", requireWalletAuth, walletRateLimiter, auditLogger('CLAIM_NEWS'), asyncHandler(async (req, res) => {
    const { articleId } = req.body;
    const walletAddress = req.walletAddress!;

    if (!articleId) {
      return res.status(400).json({ error: "Article ID required" });
    }

    // Check wallet transaction history (min 5 transactions)
    const historyCheck = await checkWalletHistory(walletAddress, 5);
    if (!historyCheck.valid) {
      return res.status(403).json({ 
        error: "Wallet requirements not met",
        details: historyCheck.error,
        txCount: historyCheck.txCount,
        required: 5
      });
    }

    let user = await storage.getUserByUsername(walletAddress);
    if (!user) {
      user = await storage.createUser({
        username: walletAddress,
        password: 'wallet-auth',
      });
      await storage.updateUserTokens(user.id, 0, 0);
      user = await storage.getUserByUsername(walletAddress);
      
      if (!user) {
        return res.status(500).json({ error: "Failed to create user" });
      }
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    
    safeLog('NEWS-IP-BINDING', `Checking for IP: ${clientIp}`);

    const existingBinding = await storage.getIpBinding(clientIp, 'news');
    
    if (existingBinding) {
      const boundWallet = normalizeAddress(existingBinding.walletAddress);
      const currentWallet = normalizeAddress(walletAddress);
      
      if (boundWallet !== currentWallet) {
        safeLog('NEWS-IP-BINDING', 'IP already used by different wallet - BLOCKED');
        return res.status(403).json({ 
          error: "This IP address is already being used by another wallet. Each IP can only be used by one wallet."
        });
      }
    }
    
    // max 5 IPs per wallet
    const walletBindings = await storage.getWalletBindings(walletAddress, 'news');
    
    if (walletBindings.length >= 5) {
      const ipAlreadyBound = walletBindings.some(b => b.ipAddress === clientIp);
      
      if (!ipAlreadyBound) {
        safeLog('NEWS-IP-BINDING', 'Wallet already has 5 IPs - BLOCKED');
        return res.status(403).json({ 
          error: "Your wallet is already registered with 5 different IPs (max limit). Please use one of your existing devices."
        });
      }
    }

    // Check if already claimed this specific article
    const existingClaim = await storage.getUserClaimForArticle(user.id, `news-${articleId}`);
    if (existingClaim) {
      return res.status(400).json({ error: "You have already claimed this article" });
    }

    // Check how many news articles claimed today
    const now = new Date();
    const utcDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));
    const todayClaims = await storage.getUserDailyClaims(user.id, utcDate);
    const newsClaimsToday = todayClaims.filter(c => c.articleId.startsWith('news-'));
    
    if (newsClaimsToday.length >= 3) {
      return res.status(400).json({ error: "You have already claimed 3 news articles today" });
    }

    const pointsEarned = 10;
    
    await storage.createUserClaim({
      userId: user.id,
      articleId: `news-${articleId}`,
      tokensEarned: pointsEarned,
    });

    const newBalance = (user.tokenBalance || 0) + pointsEarned;
    await storage.updateUserTokens(user.id, newBalance, (user.dailyClaims || 0) + 1);

    // Only create IP binding AFTER all operations succeed
    if (!existingBinding) {
      await storage.createIpBinding({
        ipAddress: clientIp,
        bindingType: 'news',
        walletAddress: normalizeAddress(walletAddress),
      });
    }

    res.json({
      pointsEarned,
      newBalance,
      claimedCount: newsClaimsToday.length + 1,
      remaining: 2 - newsClaimsToday.length,
    });
  }));

  // Get claimed news articles for today
  app.get("/api/news/claimed", async (req, res) => {
    try {
      const walletAddress = normalizeAddress(req.query.wallet as string);

      console.log('📋 [CLAIMED] Request for wallet:', walletAddress);

      if (!walletAddress) {
        console.log('❌ [CLAIMED] No wallet address');
        return res.json({ claimed: [] });
      }

      const user = await storage.getUserByUsername(walletAddress);
      if (!user) {
        console.log('❌ [CLAIMED] User not found');
        return res.json({ claimed: [] });
      }

      console.log('👤 [CLAIMED] User found:', user.id);

      const today = new Date();
      const todayClaims = await storage.getUserDailyClaims(user.id, today);
      const newsArticleIds = todayClaims
        .filter(c => c.articleId.startsWith('news-'))
        .map(c => c.articleId.replace('news-', ''));

      console.log('✅ [CLAIMED] Returning', newsArticleIds.length, 'claimed articles:', newsArticleIds);

      res.json({ claimed: newsArticleIds });
    } catch (error) {
      console.error("Error fetching claimed articles:", error);
      res.status(500).json({ error: "Failed to fetch claimed articles" });
    }
  });

  // Get claim status endpoint
  app.get("/api/claim-status", async (req, res) => {
    try {
      const rawAddress = req.headers['x-wallet-address'] as string;
      const walletAddress = normalizeAddress(rawAddress);

      console.log('📊 [CLAIM-STATUS] Request for wallet:', rawAddress, '→', walletAddress);

      if (!walletAddress) {
        console.log('❌ [CLAIM-STATUS] No wallet address provided');
        return res.json({
          claimedSections: { news: false, trading: false, airdrop: false },
          totalToday: 0,
        });
      }

      // Get user by wallet address (stored as username)
      const user = await storage.getUserByUsername(walletAddress);
      
      if (!user) {
        console.log('❌ [CLAIM-STATUS] User not found for wallet:', walletAddress);
        return res.json({
          claimedSections: { news: false, trading: false, airdrop: false },
          totalToday: 0,
        });
      }

      console.log('👤 [CLAIM-STATUS] User found:', user.id);

      const today = new Date();
      const todayClaims = await storage.getUserDailyClaims(user.id, today);
      
      console.log('📋 [CLAIM-STATUS] Today\'s claims:', todayClaims.length);
      todayClaims.forEach(claim => {
        console.log('  -', claim.articleId, ':', claim.tokensEarned, 'points');
      });
      
      const claimedSections = {
        news: todayClaims.some(c => c.articleId.startsWith('news-')),
        trading: todayClaims.some(c => c.articleId.startsWith('trading-')),
        airdrop: todayClaims.some(c => c.articleId.startsWith('airdrop-')),
      };

      console.log('✅ [CLAIM-STATUS] Claimed sections:', claimedSections);

      res.json({
        claimedSections,
        totalToday: todayClaims.length,
      });
    } catch (error) {
      console.error("❌ [CLAIM-STATUS] Error fetching claim status:", error);
      res.status(500).json({ error: "Failed to fetch claim status" });
    }
  });

  // Wallet profile with IP binding check
  app.get("/api/wallet/profile", async (req, res) => {
    try {
      const walletAddress = req.query.wallet as string || req.headers['x-wallet-address'] as string;
      
      console.log('🔍 [PROFILE] Request for wallet:', walletAddress);
      
      if (!walletAddress) {
        return res.status(400).json({ message: "Wallet address required" });
      }

      // Normalize to lowercase for DB lookup
      const normalizedAddress = walletAddress.toLowerCase();
      console.log('🔄 [PROFILE] Normalized address:', normalizedAddress);

      // FIX: Use getUserByUsername since address is stored as username
      let user = await storage.getUserByUsername(normalizedAddress);
      console.log('👤 [PROFILE] User found:', user ? `Yes (balance: ${user.tokenBalance})` : 'No');
      
      if (!user) {
        console.log('➕ [PROFILE] Creating new user for wallet:', normalizedAddress);
        user = await storage.createUser({
          username: normalizedAddress,
          password: 'wallet-auth',
        });
        // FIX: Use user.id instead of walletAddress
        await storage.updateUserTokens(user.id, 0, 0);
        user = await storage.getUserByUsername(normalizedAddress);
        console.log('✅ [PROFILE] New user created with balance:', user?.tokenBalance);
      }

      // Check IP binding for predictions
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                       req.socket.remoteAddress || 
                       'unknown';

      console.log('🔒 [PROFILE] Checking IP binding for:', clientIp);
      
      const existingBinding = await storage.getIpBinding(clientIp, 'predictions');
      
      if (existingBinding && existingBinding.walletAddress !== walletAddress) {
        console.log('❌ [PROFILE] IP already bound to different wallet');
        return res.status(403).json({ 
          message: "This IP address is already being used by another wallet. Please use a different device or contact support.",
          ipBound: true,
        });
      }

      // Create binding if it doesn't exist
      if (!existingBinding) {
        await storage.createIpBinding({
          ipAddress: clientIp,
          bindingType: 'predictions',
          walletAddress,
        });
        console.log('🔗 [PROFILE] Created IP binding for wallet');
      }

      const response = {
        walletAddress: normalizedAddress,
        tokenBalance: user?.tokenBalance || 0,
        ipBound: true,
      };
      
      console.log('📤 [PROFILE] Sending response:', response);
      res.json(response);
    } catch (error) {
      console.error("❌ [PROFILE] Error fetching wallet profile:", error);
      res.status(500).json({ 
        message: "Failed to fetch wallet profile"
      });
    }
  });

  // Place prediction bet - REQUIRES WALLET AUTH
  app.post("/api/predictions/bet", requireWalletAuth, walletRateLimiter, auditLogger('PLACE_BET'), asyncHandler(async (req, res) => {
    const { predictionId, direction, amount } = req.body;
    const walletAddress = req.walletAddress!;

    if (!predictionId || !direction || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: "Invalid bet amount" });
    }

    if (amount % 2 !== 0) {
      return res.status(400).json({ error: "Bet amount must be an even number" });
    }

    if (amount < 10) {
      return res.status(400).json({ error: "Minimum bet is 10 points" });
    }

    if (amount > 10000) {
      return res.status(400).json({ error: "Maximum bet is 10,000 points" });
    }

    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: "Direction must be 'up' or 'down'" });
    }

    const historyCheck = await checkWalletHistory(walletAddress, 5);
    if (!historyCheck.valid) {
      return res.status(403).json({ 
        error: "Wallet requirements not met",
        details: historyCheck.error,
        txCount: historyCheck.txCount,
        required: 5
      });
    }

    const user = await storage.getUserByUsername(walletAddress);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.tokenBalance < amount) {
      return res.status(400).json({ error: "Insufficient points" });
    }

    const [symbol, daysStr] = predictionId.split('-');
    if (!symbol || !daysStr) {
      return res.status(400).json({ error: "Invalid prediction ID format" });
    }

    const days = parseInt(daysStr.replace('d', ''));
    if (![3, 5, 7].includes(days)) {
      return res.status(400).json({ error: "Invalid prediction duration" });
    }

    const multiplier = days === 3 ? 2 : days === 5 ? 3 : 4;

    let currentPrice: number;
    try {
      const coinId = symbol.toLowerCase() === 'btc' ? 'bitcoin' : 'ethereum';
      const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
      
      if (!priceRes.ok) {
        throw new Error('Failed to fetch price');
      }
      
      const priceData = await priceRes.json();
      currentPrice = priceData[coinId].usd;
      
      if (!currentPrice || currentPrice <= 0) {
        throw new Error('Invalid price data');
      }
      
      safeLog('PREDICTIONS', `Current ${symbol.toUpperCase()} price: ${currentPrice}`);
    } catch (error) {
      safeLog('PREDICTIONS', 'Error fetching price');
      return res.status(503).json({ error: "Unable to fetch current price. Please try again." });
    }

    const settlementDate = new Date();
    settlementDate.setDate(settlementDate.getDate() + days);
    
    safeLog('PREDICTIONS', `Settlement date: ${settlementDate.toISOString()}`);

    const existingBets = await storage.getUserPredictions(walletAddress, 100);
    const duplicateBet = existingBets.find(
      bet => bet.predictionId === predictionId && 
             bet.status === 'pending' &&
             bet.direction === direction
    );

    if (duplicateBet) {
      return res.status(400).json({ 
        error: "You already have an active bet on this prediction",
        existingBet: duplicateBet
      });
    }

    const prediction = await storage.createPrediction({
      walletAddress,
      predictionId,
      symbol: symbol.toUpperCase(),
      direction,
      betAmount: amount,
      entryPrice: currentPrice,
      exitPrice: null,
      days,
      multiplier,
      status: 'pending',
      settlementDate,
      payout: null,
    });

    try {
      await storage.updateUserTokens(user.id, user.tokenBalance - amount, user.dailyClaims);
      safeLog('PREDICTIONS', `Deducted ${amount} points. New balance: ${user.tokenBalance - amount}`);
    } catch (error) {
      safeLog('PREDICTIONS', 'Failed to deduct points, rolling back');
      await storage.deletePrediction(prediction.id);
      return res.status(500).json({ error: "Failed to process bet. Your points were not deducted." });
    }

    res.json({ 
      success: true, 
      prediction,
      newBalance: user.tokenBalance - amount,
      message: "Bet placed successfully" 
    });
  }));

  // Get user's bets
  app.get("/api/predictions/my-bets", async (req, res) => {
    try {
      const walletAddress = req.headers['x-wallet-address'] as string || 
                           req.query.wallet as string || 
                           'default-user';

      const bets = await storage.getUserPredictions(walletAddress, 10);
      res.json(bets);
    } catch (error) {
      console.error("Error fetching bets:", error);
      res.status(500).json({ message: "Failed to fetch bets" });
    }
  });

  // Get user's predictions (alias for my-bets)
  app.get("/api/predictions/user/:address", async (req, res) => {
    try {
      const walletAddress = normalizeAddress(req.params.address);
      console.log('🎯 [PREDICTIONS-USER] Request for:', walletAddress);
      
      const bets = await storage.getUserPredictions(walletAddress, 10);
      console.log('🎯 [PREDICTIONS-USER] Found', bets.length, 'predictions');
      
      // Transform to match frontend expectations
      const predictions = bets.map(bet => ({
        id: bet.id,
        pair: `${bet.symbol}/USD`,
        direction: bet.direction,
        amount: bet.betAmount,
        status: bet.status,
        payout: bet.payout || 0,
        entryPrice: bet.entryPrice,
        exitPrice: bet.exitPrice,
        settlementDate: bet.settlementDate,
      }));
      
      console.log('🎯 [PREDICTIONS-USER] Returning predictions:', predictions.length);
      
      res.json(predictions);
    } catch (error) {
      console.error("Error fetching predictions:", error);
      res.status(500).json({ message: "Failed to fetch predictions" });
    }
  });

  // Exchange signature endpoint - REQUIRES WALLET AUTH
  app.post("/api/exchange/sign", exchangeSignLimiter, requireWalletAuth, walletRateLimiter, auditLogger('EXCHANGE_SIGN'), asyncHandler(async (req, res) => {
    const { tokenId, points } = req.body;
    const walletAddress = req.walletAddress!;

    if (!tokenId || !points) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    safeLog('EXCHANGE', `Sign request for ${walletAddress}: ${points} points for token ${tokenId}`);

    const user = await storage.getUserByUsername(walletAddress);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.tokenBalance < points) {
      safeLog('EXCHANGE', 'Insufficient points');
      return res.status(400).json({ error: "Insufficient points" });
    }

    if (points < 300) {
      return res.status(400).json({ error: "Minimum 300 points required" });
    }

    if (points > 5000) {
      return res.status(400).json({ error: "Maximum 5,000 points per exchange" });
    }

    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const contractAddress = process.env.VITE_POINTS_CLAIM_CONTRACT || process.env.POINTS_CLAIM_CONTRACT;
    
    if (contractAddress) {
      try {
        const contract = new ethers.Contract(
          contractAddress,
          ['function dailyExchanges(address, uint256) view returns (uint256 date, bool exchangedToday)'],
          provider
        );
        
        const today = Math.floor(Date.now() / (1000 * 86400));
        const dailyExchange = await contract.dailyExchanges(walletAddress, today);
        
        if (dailyExchange.exchangedToday) {
          safeLog('EXCHANGE', 'User already exchanged today');
          return res.status(400).json({ error: "You can only exchange once per day" });
        }
      } catch (error) {
        safeLog('EXCHANGE', 'Could not check daily limit');
      }
    }

    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(24);
    const randomPart = randomBytes.toString('hex');
    const nonce = `0x${timestamp.toString(16).padStart(16, '0')}${randomPart}`;
    const expiration = Math.floor(Date.now() / 1000) + 3600;

    safeLog('EXCHANGE', 'Generated nonce');

    const privateKey = process.env.BACKEND_WALLET_PRIVATE_KEY;
    
    if (!privateKey) {
      safeLog('EXCHANGE', 'Backend wallet not configured');
      return res.status(500).json({ error: "Service temporarily unavailable" });
    }
    
    if (!privateKey.match(/^(0x)?[a-f0-9]{64}$/i)) {
      safeLog('EXCHANGE', 'Invalid private key format');
      return res.status(500).json({ error: "Service configuration error" });
    }

    const wallet = new ethers.Wallet(privateKey);
    
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'uint256', 'bytes32', 'uint256'],
      [walletAddress, points, nonce, expiration]
    );

    const signingKey = new ethers.SigningKey(privateKey);
    const sig = signingKey.sign(messageHash);
    const signature = ethers.Signature.from(sig).serialized;

    safeLog('EXCHANGE', 'Signature generated');

    res.json({
      nonce,
      expiration,
      signature,
      message: "Signature generated successfully"
    });
  }));

  // Confirm exchange and deduct points (called after blockchain confirmation)
  app.post("/api/exchange/confirm", auditLogger('EXCHANGE_CONFIRM'), async (req, res) => {
    try {
      const { walletAddress: rawAddress, points, txHash } = req.body;
      const walletAddress = normalizeAddress(rawAddress);

      if (!walletAddress || !points || !txHash) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      console.log(`[EXCHANGE] Verifying transaction ${txHash} for ${walletAddress}`);

      // SECURITY: Verify transaction on-chain before deducting points
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
      
      let receipt;
      try {
        receipt = await provider.getTransactionReceipt(txHash);
      } catch (error) {
        console.error('[EXCHANGE] Failed to fetch transaction receipt:', error);
        return res.status(500).json({ error: "Failed to verify transaction" });
      }
      
      // Check transaction exists
      if (!receipt) {
        console.error('[EXCHANGE] Transaction not found:', txHash);
        return res.status(400).json({ error: "Transaction not found on blockchain" });
      }
      
      // Check transaction succeeded (status = 1)
      if (receipt.status !== 1) {
        console.error('[EXCHANGE] Transaction failed:', txHash);
        return res.status(400).json({ error: "Transaction failed on blockchain" });
      }
      
      // Verify it's calling OUR contract
      const contractAddress = process.env.VITE_POINTS_CLAIM_CONTRACT || process.env.POINTS_CLAIM_CONTRACT;
      if (!contractAddress) {
        console.error('[EXCHANGE] Contract address not configured');
        return res.status(500).json({ error: "Contract address not configured" });
      }
      
      if (receipt.to?.toLowerCase() !== contractAddress.toLowerCase()) {
        console.error('[EXCHANGE] Wrong contract address:', receipt.to, 'expected:', contractAddress);
        return res.status(400).json({ error: "Transaction not for correct contract" });
      }
      
      // Verify it's from the right wallet
      if (receipt.from?.toLowerCase() !== walletAddress.toLowerCase()) {
        console.error('[EXCHANGE] Wrong sender:', receipt.from, 'expected:', walletAddress);
        return res.status(400).json({ error: "Transaction from wrong wallet" });
      }

      // Verify transaction is recent (within last 5 minutes to prevent replay)
      const block = await provider.getBlock(receipt.blockNumber);
      const txAge = Date.now() / 1000 - (block?.timestamp || 0);
      if (txAge > 300) { // 5 minutes
        console.error('[EXCHANGE] Transaction too old:', txAge, 'seconds');
        return res.status(400).json({ error: "Transaction too old" });
      }

      console.log(`[EXCHANGE] Transaction verified successfully: ${txHash}`);

      // Get user by wallet address (stored as username)
      const user = await storage.getUserByUsername(walletAddress);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user has enough points
      if (user.tokenBalance < points) {
        console.error('[EXCHANGE] Insufficient points:', user.tokenBalance, 'needed:', points);
        return res.status(400).json({ error: "Insufficient points" });
      }

      // Deduct points using user.id
      const newBalance = Math.max(0, user.tokenBalance - points);
      await storage.updateUserTokens(user.id, newBalance, user.dailyClaims);

      console.log(`[EXCHANGE] Confirmed exchange for ${walletAddress}: ${points} points deducted. New balance: ${newBalance}`);

      res.json({
        success: true,
        newBalance,
        message: "Exchange confirmed and points deducted"
      });
    } catch (error) {
      console.error("Error confirming exchange:", error);
      res.status(500).json({ error: "Failed to confirm exchange" });
    }
  });

  // Settlement function - checks and settles pending predictions
  async function settlePredictions() {
    try {
      console.log('[SETTLEMENT] ⏰ Starting settlement check...');
      const pending = await storage.getPendingPredictions();
      
      if (pending.length === 0) {
        console.log('[SETTLEMENT] ✓ No pending predictions to settle');
        return;
      }

      console.log(`[SETTLEMENT] 📊 Found ${pending.length} pending predictions`);

      // Fetch current prices with retry logic
      let currentPrices: { BTC: number; ETH: number } | null = null;
      let retries = 3;
      
      while (retries > 0 && !currentPrices) {
        try {
          const pricesRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd', {
            headers: { 'Accept': 'application/json' }
          });
          
          if (!pricesRes.ok) {
            throw new Error(`HTTP ${pricesRes.status}`);
          }
          
          const pricesData = await pricesRes.json();
          
          // Validate price data
          if (!pricesData.bitcoin?.usd || !pricesData.ethereum?.usd) {
            throw new Error('Invalid price data structure');
          }
          
          if (pricesData.bitcoin.usd <= 0 || pricesData.ethereum.usd <= 0) {
            throw new Error('Invalid price values');
          }
          
          currentPrices = {
            BTC: pricesData.bitcoin.usd,
            ETH: pricesData.ethereum.usd,
          };
          
          console.log('[SETTLEMENT] 💰 Current prices:', currentPrices);
        } catch (error) {
          retries--;
          console.error(`[SETTLEMENT] ⚠️ Failed to fetch prices (${retries} retries left):`, error);
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          }
        }
      }

      if (!currentPrices) {
        console.error('[SETTLEMENT] ❌ Failed to fetch prices after all retries. Skipping settlement.');
        return;
      }

      const now = new Date();
      let settledCount = 0;
      let wonCount = 0;
      let lostCount = 0;

      for (const pred of pending) {
        try {
          // Check if settlement date has passed
          const settlementDate = new Date(pred.settlementDate);
          if (settlementDate > now) {
            const timeLeft = Math.round((settlementDate.getTime() - now.getTime()) / 1000 / 60);
            console.log(`[SETTLEMENT] ⏳ Prediction ${pred.id} not ready yet (${timeLeft} minutes remaining)`);
            continue;
          }

          console.log(`[SETTLEMENT] 🎯 Settling prediction ${pred.id} for ${pred.walletAddress}`);

          const exitPrice = currentPrices[pred.symbol as 'BTC' | 'ETH'];
          if (!exitPrice) {
            console.error(`[SETTLEMENT] ❌ No price found for ${pred.symbol}`);
            continue;
          }

          // Validate entry price
          if (!pred.entryPrice || pred.entryPrice <= 0) {
            console.error(`[SETTLEMENT] ❌ Invalid entry price for prediction ${pred.id}`);
            continue;
          }

          // Calculate price change percentage
          const priceChange = ((exitPrice - pred.entryPrice) / pred.entryPrice) * 100;
          console.log(`[SETTLEMENT] 📈 ${pred.symbol}: Entry $${pred.entryPrice.toFixed(2)} -> Exit $${exitPrice.toFixed(2)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);

          // Determine if prediction won (needs ±5% movement in predicted direction)
          let won = false;
          if (pred.direction === 'up' && priceChange >= 5) {
            won = true;
          } else if (pred.direction === 'down' && priceChange <= -5) {
            won = true;
          }

          const status = won ? 'won' : 'lost';
          const payout = won ? pred.betAmount * pred.multiplier : 0;

          console.log(`[SETTLEMENT] ${won ? '✅' : '❌'} Result: ${status.toUpperCase()}, Payout: ${payout} points`);

          // Update user balance FIRST if won (before marking as settled)
          if (won) {
            const user = await storage.getUserByUsername(pred.walletAddress);
            if (!user) {
              console.error(`[SETTLEMENT] ❌ User not found: ${pred.walletAddress}`);
              continue;
            }

            const newBalance = user.tokenBalance + payout;
            
            // Validate new balance
            if (newBalance < 0 || !Number.isFinite(newBalance)) {
              console.error(`[SETTLEMENT] ❌ Invalid new balance: ${newBalance}`);
              continue;
            }

            // Try to update balance
            try {
              await storage.updateUserTokens(user.id, newBalance, user.dailyClaims);
              console.log(`[SETTLEMENT] 💰 Paid out ${payout} points to ${pred.walletAddress}. New balance: ${newBalance}`);
            } catch (error) {
              console.error(`[SETTLEMENT] ❌ Failed to pay out to ${pred.walletAddress}:`, error);
              // Don't mark as settled if payout failed
              continue;
            }
            wonCount++;
          } else {
            console.log(`[SETTLEMENT] 💸 User lost ${pred.betAmount} points (already deducted)`);
            lostCount++;
          }

          // Update prediction status AFTER successful payout (or if lost)
          await storage.updatePredictionStatus(pred.id, status, exitPrice, payout);

          settledCount++;
        } catch (error) {
          console.error(`[SETTLEMENT] ❌ Error settling prediction ${pred.id}:`, error);
          // Continue with next prediction instead of failing entire settlement
        }
      }

      console.log(`[SETTLEMENT] ✅ Settlement complete: ${settledCount} settled (${wonCount} won, ${lostCount} lost)`);
    } catch (error) {
      console.error('[SETTLEMENT] ❌ Critical error during settlement:', error);
    }
  }

  // Run settlement every 5 minutes
  setInterval(settlePredictions, 5 * 60 * 1000);
  
  // Run settlement on startup (after 10 seconds)
  setTimeout(settlePredictions, 10000);
  console.log('[SETTLEMENT] 🚀 Settlement scheduler initialized (runs every 5 minutes)');

  // Initial pre-scraping on startup (don't block server startup)
  setTimeout(async () => {
    try {
      console.log('[STARTUP] 🔥 Triggering initial article pre-scraping...');
      const initialNews = await getCachedRSS();
      // Pre-scraping happens in background
    } catch (error) {
      console.error('[STARTUP] Failed to trigger initial pre-scraping:', error);
    }
  }, 5000); // Wait 5 seconds after server starts

  const httpServer = createServer(app);
  return httpServer;
}
