import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const walletAddress = url.searchParams.get('wallet');

    if (!walletAddress) {
      return new Response(JSON.stringify({ claimed: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Get user
    const user = await context.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(normalizedAddress).first();

    if (!user) {
      return new Response(JSON.stringify({ claimed: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get today's claims
    const today = new Date().toISOString().split('T')[0];
    const claims = await context.env.DB.prepare(
      'SELECT articleId FROM user_claims WHERE userId = ? AND DATE(claimedAt) = ?'
    ).bind(user.id, today).all();

    const claimedArticleIds = claims.results.map((c: any) => c.articleId);

    return new Response(JSON.stringify({ 
      claimed: claimedArticleIds 
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    console.error('[NEWS-CLAIMED] Error:', error);
    return new Response(JSON.stringify({ 
      claimed: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
