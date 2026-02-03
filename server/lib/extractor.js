// Shared article extraction utilities
// Centralizes scraping logic for both /api/scrape and /api/article/:id
// Don't change logic here without testing both endpoints

import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import http from 'http';
import https from 'https';

// Simple in-memory cache for extracted HTML keyed by normalized URL
// TTL 10 minutes to ensure fresh content
const htmlCache = new Map(); // key -> { html, meta, ts }
const DEFAULT_HTML_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getCachedExtraction(url) {
  try {
    const key = normalizeUrl(url);
    const entry = htmlCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > DEFAULT_HTML_TTL_MS) {
      htmlCache.delete(key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function setCachedExtraction(url, payload) {
  try {
    const key = normalizeUrl(url);
    htmlCache.set(key, { ...payload, ts: Date.now() });
  } catch {}
}

export function clearCache() {
  htmlCache.clear();
}

async function fetchWithRetries(url, options = {}, retries = 2) {
  let lastErr;
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  ];
  // Reuse TCP connections to reduce latency
  const isHttps = (() => { try { return new URL(url).protocol === 'https:'; } catch { return true; } })();
  const agent = isHttps
    ? new https.Agent({ keepAlive: true, maxSockets: 10 })
    : new http.Agent({ keepAlive: true, maxSockets: 10 });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ua = uas[Math.min(attempt, uas.length - 1)];
      const res = await fetch(url, {
        ...options,
        // pass keep-alive agent
        agent,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://www.google.com/',
          ...(options.headers || {}),
        },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      // small backoff
      await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Normalizes a URL by removing query parameters, hash, and trailing slashes
 * for more reliable comparison.
 */
export function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/$/, ''); // remove trailing slash
    return url.toString();
  } catch {
    return u; // Return original if invalid
  }
}

/**
 * Attempt to locate the most likely main content node by scoring
 * candidates that contain multiple paragraphs and longer text.
 */
export function pickBestContentNode(doc) {
  // Remove obvious non-content nodes early
  doc.querySelectorAll('script, style, noscript, iframe, form, footer, header, nav').forEach(el => el.remove());

  // Heuristic scoring: prefer nodes with many <p> and long text
  const candidates = Array.from(doc.querySelectorAll('main, article, section, div'));
  let best = null;
  let bestScore = 0;

  for (const el of candidates) {
    const text = el.textContent || '';
    const pCount = el.querySelectorAll('p').length;
    const liCount = el.querySelectorAll('li').length;
    const len = text.replace(/\s+/g, ' ').trim().length;

    // Penalize if it looks like a nav/sidebar/related section by class/id
    const label = (el.className + ' ' + (el.id || '')).toLowerCase();
    const isJunk = /(nav|footer|header|sidebar|menu|subscribe|newsletter|related|promo|advert|social)/.test(label);
    if (isJunk) continue;

    // Score: paragraphs are valuable, list items add a bit, and raw length matters
    const score = pCount * 50 + liCount * 10 + Math.min(len, 20000) / 20;
    if (score > bestScore && len > 500) {
      best = el;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Fetches the article's HTML directly and extracts the main content body.
 * This is the robust implementation used across endpoints.
 */
export async function extractHtmlFromArticlePage(targetUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000); // 10-second timeout

  const res = await fetchWithRetries(targetUrl, { signal: controller.signal }, 2);

  clearTimeout(timer);

  const html = await res.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Preferred selectors for CoinDesk
  const selectors = [
    '[data-component="ArticleBody"]',
    'article [data-component="ArticleBody"]',
    '[data-module="article-body"], [data-module="article-body-block"]',
    '.article-body, .article__body, .article-content, .content-area',
    'article',
    'main article',
  ];

  let articleNode;
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (element && (element.textContent || '').trim().length > 200) {
      articleNode = element;
      break;
    }
  }

  // If predefined selectors fail, fall back to heuristic picker
  let strategy = 'selectors';
  if (!articleNode) {
    articleNode = pickBestContentNode(doc);
    strategy = 'heuristic-picker';
  }

  const ensureClean = (node) => {
    if (!node) return '';
    
    // STEP 1: Remove junk elements
    node.querySelectorAll('script, style, noscript, iframe, figure, aside, svg, video, button, nav, footer, header, form, select, input, textarea').forEach(el => el.remove());
    
    // STEP 2: Extract only content elements (p, h1-h6, ul, ol, blockquote)
    const contentElements = node.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, a, strong, em, br');
    
    // STEP 3: Rebuild clean HTML with ONLY content tags, no wrapper divs
    const cleanParts = [];
    const processed = new Set();
    const seenHeadings = new Set();
    let hitEndMarker = false;
    
    // Kill phrases that indicate end of article
    // "what to know:" is a legit CoinDesk section, NOT an end marker
    const endMarkers = [
      'more for you',
      'what to watch',
      'read more:',
      'related stories',
      'latest crypto news',
      'recommended',
      'also read',
      'trending',
      'popular',
      'you may also like',
      'subscribe to',
      'sign up for',
      'newsletter',
      'follow us',
      'share this',
      'advertisement',
    ];
    
    contentElements.forEach(el => {
      // Stop if we hit end marker
      if (hitEndMarker) return;
      
      // Skip if already processed (child of another element)
      if (processed.has(el)) return;
      
      // Skip if parent is already in our list (avoid duplicates)
      let parent = el.parentElement;
      let shouldSkip = false;
      while (parent && parent !== node) {
        if (processed.has(parent)) {
          shouldSkip = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (shouldSkip) return;
      
      const tag = el.tagName.toLowerCase();
      const text = el.textContent?.trim() || '';
      const textLower = text.toLowerCase();
      
      // Skip empty or very short elements
      if (!text || text.length < 10) return;
      
      // Check for end markers - only in headings or standalone text
      for (const marker of endMarkers) {
        // For headings, check if the entire heading is just the marker
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
          if (textLower === marker || textLower.startsWith(marker)) {
            console.log('🛑 Hit end marker in heading:', marker, 'in text:', text.substring(0, 50));
            hitEndMarker = true;
            return;
          }
        }
        // For other elements, only match if it's the main content (not a link or small text)
        else if (text.length < 100 && textLower === marker) {
          console.log('🛑 Hit end marker:', marker, 'in text:', text.substring(0, 50));
          hitEndMarker = true;
          return;
        }
      }
      
      // For headings, check for duplicates (indicates article list)
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        const headingKey = textLower.substring(0, 50);
        if (seenHeadings.has(headingKey)) {
          console.log('🛑 Duplicate heading detected:', text.substring(0, 50));
          hitEndMarker = true;
          return;
        }
        seenHeadings.add(headingKey);
      }
      
      // Skip navigation-like content
      if (/(share|subscribe|newsletter|sign in|back to|select language|follow us|advertisement)/i.test(text)) return;
      
      // For lists, get the whole list
      if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(el.querySelectorAll('li'))
          .map(li => `<li>${li.textContent?.trim()}</li>`)
          .filter(li => li.length > 20);
        
        if (items.length > 0) {
          cleanParts.push(`<${tag}>${items.join('')}</${tag}>`);
          processed.add(el);
        }
        return;
      }
      
      // For paragraphs and headings
      if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag)) {
        // Preserve links and formatting inside
        let innerHTML = el.innerHTML;
        
        // Strip all attributes except href
        innerHTML = innerHTML.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>/gi, '<a href="$1">');
        innerHTML = innerHTML.replace(/<([^>]+)\s+class="[^"]*"/gi, '<$1');
        innerHTML = innerHTML.replace(/<([^>]+)\s+id="[^"]*"/gi, '<$1');
        innerHTML = innerHTML.replace(/<([^>]+)\s+style="[^"]*"/gi, '<$1');
        innerHTML = innerHTML.replace(/<([^>]+)\s+data-[^=]*="[^"]*"/gi, '<$1');
        
        cleanParts.push(`<${tag}>${innerHTML}</${tag}>`);
        processed.add(el);
      }
    });
    
    console.log('✂️ Extracted', cleanParts.length, 'content elements');
    return cleanParts.join('\n');
  };

  let cleanedHtml = ensureClean(articleNode);
  let textLen = cleanedHtml.length;
  
  // Check for paywall indicators
  const rawText = cleanedHtml.toLowerCase();
  const paywallIndicators = [
    'create a free account to continue reading',
    'you\'ve reached your monthly limit',
    'sign up for free',
    'subscribe to continue reading',
    'this article is for subscribers only',
    'become a member to read',
    'premium content'
  ];
  
  const isPaywalled = paywallIndicators.some(indicator => rawText.includes(indicator));
  
  if (isPaywalled) {
    console.log('[EXTRACTOR] Detected paywall, throwing error');
    throw new Error('Article is behind a paywall');
  }
  
  console.log('[EXTRACTOR] Initial extraction:', { textLen, hasHtml: !!cleanedHtml, strategy });

  if (!cleanedHtml || textLen < 500) {
    // Fallback 1.5: Aggregate paragraphs when page uses split paragraph blocks
    if (doc) {
      const paraNodes = Array.from(
        doc.querySelectorAll('[data-component="Paragraph"], article p, main p, .article-body p, .article__body p, .article-content p')
      ).filter(n => (n.textContent || '').trim().length > 40);
      if (paraNodes.length >= 4) {
        const htmlJoined = paraNodes.map(n => `<p>${n.textContent.trim()}</p>`).join('\n');
        const joinedLen = paraNodes.reduce((acc, n) => acc + (n.textContent || '').trim().length, 0);
        if (joinedLen > textLen) {
          cleanedHtml = htmlJoined;
          textLen = joinedLen;
          strategy = 'paragraph-aggregate';
        }
      }
    }

    // Attempt AMP version
    let ampUrl = targetUrl;
    if (!/\/amp\/?$/.test(ampUrl)) {
      try {
        const u = new URL(targetUrl);
        if (!u.pathname.endsWith('/')) u.pathname += '/';
        u.pathname += 'amp/';
        ampUrl = u.toString();
      } catch {}
    }

    try {
      const ampRes = await fetchWithRetries(ampUrl, {}, 1);
      if (ampRes.ok) {
        const ampHtml = await ampRes.text();
        const ampDom = new JSDOM(ampHtml);
        const ampDoc = ampDom.window.document;
        const ampNode = ampDoc.querySelector('article') || ampDoc.querySelector('main') || pickBestContentNode(ampDoc);
        const ampClean = ensureClean(ampNode);
        // Calculate length from CLEANED HTML, not raw node (to avoid false positives)
        const ampLen = ampClean.replace(/<[^>]*>/g, '').trim().length;
        if (ampClean && ampLen > textLen) {
          cleanedHtml = ampClean;
          textLen = ampLen;
          strategy = 'amp-fallback';
        }
      }
    } catch {}
  }

  if (!cleanedHtml || textLen < 150) {
    console.error('[EXTRACTOR] Failed to extract content:', { textLen, hasHtml: !!cleanedHtml });
    throw new Error('Article content too short or unavailable');
  }
  
  console.log('[EXTRACTOR] Success:', { textLen, strategy });

  return { html: cleanedHtml, meta: { strategy, textLen, url: targetUrl } };
}

// Cached helper: check cache first, otherwise extract and cache
export async function extractHtmlFromArticlePageCached(targetUrl) {
  const cached = getCachedExtraction(targetUrl);
  if (cached?.html && cached?.meta) {
    return { html: cached.html, meta: cached.meta };
  }
  const out = await extractHtmlFromArticlePage(targetUrl);
  setCachedExtraction(targetUrl, out);
  return out;
}
