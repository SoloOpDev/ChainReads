import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const walletAddress = context.request.headers.get('x-wallet-address');

    if (!walletAddress) {
      return new Response(JSON.stringify({
        claimedSections: [],
        totalToday: 0
      }), {
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
      return new Response(JSON.stringify({
        claimedSections: [],
        totalToday: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get claimed sections
    const claimedSections = await context.env.DB.prepare(
      'SELECT section FROM section_claims WHERE userId = ?'
    ).bind(user.id).all();

    // Get today's total claims
    const today = new Date().toISOString().split('T')[0];
    const todayClaims = await context.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_claims WHERE userId = ? AND DATE(claimedAt) = ?'
    ).bind(user.id, today).first();

    const response = {
      claimedSections: claimedSections.results.map((c: any) => c.section),
      totalToday: todayClaims?.count || 0
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[CLAIM-STATUS] Error:', error);
    return new Response(JSON.stringify({
      claimedSections: [],
      totalToday: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};