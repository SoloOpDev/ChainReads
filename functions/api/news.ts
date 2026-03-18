import type { Env } from '../_middleware';

export async function onRequestGet(context: EventContext<Env, any, any>) {
  const { storage } = context.data;
  const url = new URL(context.request.url);
  
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  
  try {
    const articles = await storage.getNewsArticles(limit, offset);
    
    return new Response(JSON.stringify(articles), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to fetch news:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch news' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}