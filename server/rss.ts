import Parser from 'rss-parser';
import type { NewsArticle, CachedNews, RSSItem } from './types/news.js';

const parser = new Parser({
  customFields: {
    item: [
      'content:encoded', // This will be accessible as item['content:encoded']
      ['media:content', 'media'],
      ['media:thumbnail', 'thumbnail'],
      ['enclosure', 'enclosure'],
    ],
  },
});

export async function fetchCoinDeskRSS(): Promise<CachedNews> {
  try {
    const feed = await parser.parseURL('https://www.coindesk.com/arc/outboundfeeds/rss/');
    console.log('RSS Feed fetched:', feed.items?.length || 0, 'items');
    
    // Debug: Check first item's structure
    if (feed.items.length > 0) {
      const firstItem = feed.items[0] as any;
      console.log('🔍 First item keys:', Object.keys(firstItem));
      console.log('🔍 contentEncoded:', firstItem.contentEncoded ? firstItem.contentEncoded.substring(0, 200) : 'NOT FOUND');
      console.log('🔍 content:encoded:', firstItem['content:encoded'] ? firstItem['content:encoded'].substring(0, 200) : 'NOT FOUND');
      console.log('🔍 content:', firstItem.content ? firstItem.content.substring(0, 200) : 'NOT FOUND');
    }
    
    const results = feed.items.slice(0, 50).map((item: RSSItem, index): NewsArticle => {
      const url = item.link || '';
      const id = (index + 1).toString();
      
      // Access the encoded content directly
      const itemAny = item as any;
      const fullContent = itemAny['content:encoded'] || '';
      const description = item.contentSnippet || item.summary || '';
      
      // CoinDesk RSS feed has empty content:encoded, so we need to scrape
      // Set content to empty string to force scraping in the article endpoint
      let content = '';
      
      // Only use RSS content if it's substantial (>500 chars)
      if (fullContent && fullContent.length > 500) {
        // Clean up the RSS content - remove scripts/styles but keep article content
        content = fullContent
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/<style[^>]*>.*?<\/style>/gi, '')
          .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
          .replace(/<div[^>]*class="[^"]*ad[^"]*"[^>]*>.*?<\/div>/gi, '')
          .replace(/<div[^>]*class="[^"]*promo[^"]*"[^>]*>.*?<\/div>/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        console.log(`✅ Article ${id}: Using RSS content (${content.length} chars)`);
      } else {
        // CoinDesk RSS doesn't provide full content, leave empty to force scraping
        console.log(`📰 Article ${id}: ${item.title?.substring(0, 50)}... - No RSS content, will scrape`);
      }
      
      return {
        id,
        title: item.title || '',
        description,
        content, // Use the cleaned RSS content instead of empty string
        source: {
          title: 'CoinDesk',
          domain: 'coindesk.com',
        },
        published_at: item.pubDate || new Date().toISOString(),
        created_at: new Date().toISOString(),
        image: item.media?.$.url || item.enclosure?.url || item.thumbnail?.$.url || null,
        original_url: url,
        kind: 'article',
        author: item.creator || null
      };
    });

    console.log('✅ Transformed results:', results.length, 'articles with content');
    return { results };
  } catch (error) {
    console.error('❌ Error fetching RSS feed:', error);
    throw error;
  }
}
