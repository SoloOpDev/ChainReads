import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { walletAddress: rawAddress, points, txHash } = await context.request.json() as {
      walletAddress: string;
      points: number;
      txHash: string;
    };

    if (!rawAddress || !points || !txHash) {
      return new Response(JSON.stringify({ 
        error: "Missing required fields" 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedAddress = rawAddress.toLowerCase();

    console.log(`[EXCHANGE-CONFIRM] Processing: wallet=${normalizedAddress}, points=${points}, tx=${txHash}`);

    // Get user
    const user = await context.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(normalizedAddress).first();

    if (!user) {
      return new Response(JSON.stringify({ 
        error: "User not found" 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if transaction already processed
    const existingExchange = await context.env.DB.prepare(
      'SELECT * FROM exchanges WHERE txHash = ?'
    ).bind(txHash).first();

    if (existingExchange) {
      console.log(`[EXCHANGE-CONFIRM] Transaction already processed: ${txHash}`);
      return new Response(JSON.stringify({ 
        success: true,
        message: "Transaction already processed",
        alreadyProcessed: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Deduct points
    const newBalance = Math.max(0, (user.tokenBalance || 0) - points);
    await context.env.DB.prepare(
      'UPDATE users SET tokenBalance = ? WHERE id = ?'
    ).bind(newBalance, user.id).run();

    // Record exchange
    const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    await context.env.DB.prepare(
      'INSERT INTO exchanges (id, walletAddress, points, txHash, date, confirmedAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      `exchange-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      normalizedAddress,
      points,
      txHash,
      today,
      new Date().toISOString()
    ).run();

    console.log(`[EXCHANGE-CONFIRM] Success: ${normalizedAddress} exchanged ${points} points, new balance: ${newBalance}`);

    return new Response(JSON.stringify({
      success: true,
      newBalance,
      pointsDeducted: points,
      txHash
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[EXCHANGE-CONFIRM] Error:', error);
    return new Response(JSON.stringify({ 
      error: "Failed to confirm exchange",
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};