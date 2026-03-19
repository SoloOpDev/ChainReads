import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ADMIN_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { walletAddress, points, adminSecret } = await context.request.json() as {
      walletAddress: string;
      points: number;
      adminSecret: string;
    };

    // Verify admin secret
    const expectedSecret = context.env.ADMIN_SECRET || 'change-me-in-production';
    if (!adminSecret || adminSecret !== expectedSecret) {
      console.log('[ADMIN] Unauthorized grant attempt');
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!walletAddress || !points) {
      return new Response(JSON.stringify({ error: "Wallet address and points required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (typeof points !== 'number' || points <= 0) {
      return new Response(JSON.stringify({ error: "Points must be a positive number" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (points > 100000) {
      return new Response(JSON.stringify({ error: "Maximum 100,000 points per grant" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Get or create user
    let user = await context.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(normalizedAddress).first();

    if (!user) {
      await context.env.DB.prepare(
        'INSERT INTO users (id, username, password, tokenBalance, dailyClaims) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        normalizedAddress,
        'wallet-auth',
        0,
        0
      ).run();

      user = await context.env.DB.prepare(
        'SELECT * FROM users WHERE username = ?'
      ).bind(normalizedAddress).first();
    }

    if (!user) {
      return new Response(JSON.stringify({ error: "Failed to create user" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Grant points
    const newBalance = (user.tokenBalance || 0) + points;
    await context.env.DB.prepare(
      'UPDATE users SET tokenBalance = ? WHERE id = ?'
    ).bind(newBalance, user.id).run();

    console.log(`[ADMIN] Granted ${points} points to ${walletAddress}. New balance: ${newBalance}`);

    return new Response(JSON.stringify({
      success: true,
      walletAddress: normalizedAddress,
      pointsGranted: points,
      newBalance,
      message: `Successfully granted ${points} points`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[ADMIN] Error granting points:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to grant points',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
