import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const walletAddress = context.request.headers.get('x-wallet-address');

    console.log('📜 [CLAIMS-HISTORY] Request for wallet:', walletAddress);

    if (!walletAddress) {
      console.log('❌ [CLAIMS-HISTORY] No wallet address');
      return new Response(JSON.stringify([]), {
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
      console.log('❌ [CLAIMS-HISTORY] User not found');
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('👤 [CLAIMS-HISTORY] User found:', user.id);

    // Get all claims
    const claims = await context.env.DB.prepare(
      'SELECT * FROM user_claims WHERE userId = ? ORDER BY claimedAt DESC'
    ).bind(user.id).all();

    console.log('📋 [CLAIMS-HISTORY] Found claims:', claims.results.length);

    return new Response(JSON.stringify(claims.results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[CLAIMS-HISTORY] Error:', error);
    return new Response(JSON.stringify([]), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
