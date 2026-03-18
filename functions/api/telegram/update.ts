import type { Env } from '../../_middleware';

export async function onRequestPost(context: EventContext<Env, any, any>) {
  const { storage, env } = context.data;
  
  try {
    const body = await context.request.json();
    const { secret, posts } = body;
    
    // Verify secret
    if (!secret || secret !== env.TELEGRAM_UPDATE_SECRET) {
      return new Response(JSON.stringify({ error: 'Invalid secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!posts || !Array.isArray(posts)) {
      return new Response(JSON.stringify({ error: 'Posts array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`📥 Received ${posts.length} posts for update`);
    
    // Store posts in D1 database
    const inserted = await storage.upsertTelegramPosts(posts);
    
    console.log(`✅ Successfully processed ${inserted} posts`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      processed: inserted,
      message: `Successfully processed ${inserted} posts`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('❌ Failed to update telegram posts:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to update posts',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}