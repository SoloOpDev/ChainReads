import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const address = context.params.address as string;
    const normalizedAddress = address.toLowerCase();

    console.log('💰 [POINTS] Request for address:', address, '→', normalizedAddress);

    // Get user
    const user = await context.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(normalizedAddress).first();

    console.log('👤 [POINTS] User found:', user ? `Yes (balance: ${user.tokenBalance})` : 'No');

    if (!user) {
      console.log('❌ [POINTS] No user found, returning 0');
      return new Response(JSON.stringify({
        totalPoints: 0,
        articlesRead: 0,
        claimsToday: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get today's claims
    const today = new Date().toISOString().split('T')[0];
    const todayClaims = await context.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_claims WHERE userId = ? AND DATE(claimedAt) = ?'
    ).bind(user.id, today).first();

    const response = {
      totalPoints: user.tokenBalance || 0,
      articlesRead: user.dailyClaims || 0,
      claimsToday: todayClaims?.count || 0
    };

    console.log('📤 [POINTS] Sending response:', response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[POINTS] Error:', error);
    return new Response(JSON.stringify({ 
      totalPoints: 0,
      articlesRead: 0,
      claimsToday: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
