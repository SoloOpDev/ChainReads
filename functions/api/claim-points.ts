import type { PagesFunction } from '@cloudflare/workers-types';
import { ethers } from 'ethers';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

async function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
  } catch (error) {
    console.error('[AUTH] Signature verification failed:', error);
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    // Verify wallet authentication
    const walletAddress = context.request.headers.get('x-wallet-address');
    const signature = context.request.headers.get('x-wallet-signature');
    const timestamp = context.request.headers.get('x-timestamp');

    if (!walletAddress || !signature || !timestamp) {
      return new Response(JSON.stringify({ 
        error: "Authentication required"
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check timestamp
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    const timeDiff = Math.abs(now - requestTime);
    if (timeDiff > 5 * 60 * 1000) {
      return new Response(JSON.stringify({ 
        error: "Signature expired"
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify signature
    const message = `Authenticate wallet: ${walletAddress}\nTimestamp: ${timestamp}`;
    const isValid = await verifyWalletSignature(walletAddress, message, signature);
    
    if (!isValid) {
      return new Response(JSON.stringify({ 
        error: "Invalid signature"
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { section } = await context.request.json() as { section: string };
    const normalizedAddress = walletAddress.toLowerCase();

    if (!section) {
      return new Response(JSON.stringify({ error: "Section required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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

    // Check if already claimed this section
    const existingClaim = await context.env.DB.prepare(
      'SELECT * FROM section_claims WHERE userId = ? AND section = ?'
    ).bind(user.id, section).first();

    if (existingClaim) {
      return new Response(JSON.stringify({ 
        error: "Already claimed",
        message: `You've already claimed points for ${section}`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Award points (50 per section)
    const pointsAwarded = 50;
    const newBalance = (user.tokenBalance || 0) + pointsAwarded;

    await context.env.DB.prepare(
      'UPDATE users SET tokenBalance = ? WHERE id = ?'
    ).bind(newBalance, user.id).run();

    // Record claim
    await context.env.DB.prepare(
      'INSERT INTO section_claims (id, userId, section, points, claimedAt) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      `claim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user.id,
      section,
      pointsAwarded,
      new Date().toISOString()
    ).run();

    console.log(`[CLAIM-POINTS] ${normalizedAddress} claimed ${pointsAwarded} points for ${section}`);

    return new Response(JSON.stringify({
      success: true,
      pointsAwarded,
      newBalance,
      section
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[CLAIM-POINTS] Error:', error);
    return new Response(JSON.stringify({ 
      error: "Failed to claim points",
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
