import type { Env } from '../../_middleware';
import { fetchCoinDeskRSS } from './rss';

export async function onRequestGet(context: EventContext<Env, any, any>) {
  const { storage, kv } = context.data;
  const url = new URL(context.request.url);
  
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  
  try {
    // Try to get cached news first
    const cacheKey = `news:rss:${limit}:${offset}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      const parsedCache = JSON.parse(cached);
      return new Response(JSON.stringify(parsedCache), {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }
    
    // Fetch fresh RSS data from CoinDesk
    console.log('🔄 Fetching fresh RSS data from CoinDesk...');
    const rssData = await fetchCoinDeskRSS();
    
    // Store articles in D1 database for future use
    try {
      if (rssData.results && rssData.results.length > 0) {
        console.log('💾 Storing articles in D1 database...');
        await storage.createNewsArticles(rssData.results);
        console.log('✅ Articles stored in database');
      }
    } catch (dbError) {
      console.error('⚠️ Failed to store in database:', dbError);
      // Continue anyway - we have the RSS data
    }
    
    // Apply pagination to RSS results
    const paginatedResults = rssData.results.slice(offset, offset + limit);
    
    const transformedData = {
      results: paginatedResults,
      next: offset + limit < rssData.results.length ? `?limit=${limit}&offset=${offset + limit}` : null,
      previous: offset > 0 ? `?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null
    };
    
    // Cache for 10 minutes (RSS doesn't update that frequently)
    await kv.put(cacheKey, JSON.stringify(transformedData), { expirationTtl: 600 });
    
    return new Response(JSON.stringify(transformedData), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600'
      }
    });
  } catch (error) {
    console.error('❌ Failed to fetch RSS news:', error);
    
    // Try to fallback to database
    try {
      console.log('🔄 Trying database fallback...');
      const articles = await storage.getNewsArticles(limit, offset);
      if (articles && articles.length > 0) {
        const fallbackData = {
          results: articles,
          next: null,
          previous: null
        };
        return new Response(JSON.stringify(fallbackData), {
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }
    } catch (dbError) {
      console.error('❌ Database fallback also failed:', dbError);
    }
    
    // Last resort: return mock data to prevent app crash
    const fallbackData = {
      results: [
        {
          id: "1",
          title: "CoinDesk RSS Feed Temporarily Unavailable",
          description: "We're working to restore the live news feed. Please check back shortly.",
          published_at: new Date().toISOString(),
          source: { title: "ChainReads", domain: "chainreads.com" },
          image: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400",
          url: "#",
          original_url: "#",
          kind: "article",
          author: null,
          content: "The RSS feed is temporarily unavailable. Our team is working to restore service.",
          created_at: new Date().toISOString(),
          instruments: null,
          votes: null
        }
      ],
      next: null,
      previous: null
    };
    
    return new Response(JSON.stringify(fallbackData), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
  }
}