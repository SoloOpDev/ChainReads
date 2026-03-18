import type { Env } from '../../_middleware';

export async function onRequestGet(context: EventContext<Env, any, any>) {
  const { storage, kv } = context.data;
  const { id } = context.params;
  
  if (!id) {
    return new Response(JSON.stringify({ error: 'Article ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Try cache first
    const cacheKey = `article:${id}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      return new Response(cached, {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600' // 1 hour
        }
      });
    }
    
    // Try to get from database
    let article = null;
    try {
      article = await storage.getNewsArticle(id);
    } catch (dbError) {
      console.error('Database query failed:', dbError);
    }
    
    // If not in database, create a placeholder
    if (!article) {
      article = {
        id,
        title: "Article Content Loading...",
        description: "This article is being processed. Please check back in a moment.",
        content: "The full article content is being loaded from our news sources. Please refresh the page or try again in a few moments.",
        published_at: new Date().toISOString(),
        source: { title: "CoinDesk", domain: "coindesk.com" },
        image: null,
        url: "#",
        original_url: "#",
        kind: "article",
        author: null,
        created_at: new Date().toISOString(),
        instruments: null,
        votes: null
      };
    }
    
    const response = JSON.stringify(article);
    
    // Cache for 1 hour
    await kv.put(cacheKey, response, { expirationTtl: 3600 });
    
    return new Response(response, {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error(`Failed to fetch article ${id}:`, error);
    
    // Return a fallback article
    const fallbackArticle = {
      id,
      title: "Article Unavailable",
      description: "This article is temporarily unavailable.",
      content: "We're sorry, but this article content is currently unavailable. Please try again later or browse other articles.",
      published_at: new Date().toISOString(),
      source: { title: "ChainReads" },
      image: null,
      url: "#"
    };
    
    return new Response(JSON.stringify(fallbackArticle), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }
}