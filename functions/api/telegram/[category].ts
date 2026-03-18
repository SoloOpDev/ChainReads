import type { Env } from '../../_middleware';

export async function onRequestGet(context: EventContext<Env, any, any>) {
  const { storage, kv } = context.data;
  const { category } = context.params;
  const url = new URL(context.request.url);
  
  // Validate category
  if (!category || !['trading', 'airdrop'].includes(category as string)) {
    return new Response(JSON.stringify({ error: 'Invalid category' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);
  
  try {
    // Try cache first
    const cacheKey = `telegram:${category}:${limit}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      return new Response(cached, {
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=180'
        }
      });
    }
    
    // Fetch from database
    const posts = await storage.getTelegramPosts(category as string, limit);
    const response = JSON.stringify(posts || []); // Ensure array fallback
    
    // Cache for 3 minutes
    await kv.put(cacheKey, response, { expirationTtl: 180 });
    
    return new Response(response, {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=180'
      }
    });
  } catch (error) {
    console.error(`Failed to fetch ${category} posts:`, error);
    
    // Return empty array instead of error
    return new Response(JSON.stringify([]), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
  }
}