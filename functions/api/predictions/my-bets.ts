import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const walletAddress = url.searchParams.get('wallet') || 
                         context.request.headers.get('x-wallet-address');

    if (!walletAddress) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Get user's bets
    const bets = await context.env.DB.prepare(
      'SELECT * FROM prediction_bets WHERE walletAddress = ? ORDER BY placedAt DESC'
    ).bind(normalizedAddress).all();

    return new Response(JSON.stringify(bets.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[PREDICTIONS-MY-BETS] Error:', error);
    return new Response(JSON.stringify([]), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};