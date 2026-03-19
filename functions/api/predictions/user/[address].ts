import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const address = context.params.address as string;
    const normalizedAddress = address.toLowerCase();

    console.log('🎯 [PREDICTIONS-USER] Request for:', normalizedAddress);

    // Get user's bets
    const bets = await context.env.DB.prepare(
      'SELECT * FROM prediction_bets WHERE walletAddress = ? ORDER BY placedAt DESC'
    ).bind(normalizedAddress).all();

    console.log('🎯 [PREDICTIONS-USER] Found bets:', bets.results.length);

    return new Response(JSON.stringify(bets.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[PREDICTIONS-USER] Error:', error);
    return new Response(JSON.stringify([]), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};