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

    const { articleId } = await context.request.json() as { articleId: string };
    const normalizedAddress = walletAddress.toLowerCase();

    if (!articleId) {
      return new Response(JSON.stringify({ error: "Article ID required" }), {
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

    // Check if already claimed this article
    const existingClaim = await context.env.DB.prepare(
      'SELECT * FROM user_claims WHERE userId = ? AND articleId = ?'
    ).bind(user.id, articleId).first();

    if (existingClaim) {
      return new Response(JSON.stringify({ 
        error: "Already claimed",
        message: "You've already claimed points for this article"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check daily limit (3 articles per day)
    const today = new Date().toISOString().split('T')[0];
    const todayClaims = await context.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_claims WHERE userId = ? AND DATE(claimedAt) = ?'
    ).bind(user.id, today).first();

    if (todayClaims && todayClaims.count >= 3) {
      return new Response(JSON.stringify({ 
        error: "Daily limit reached",
        message: "You can only claim 3 articles per day",
        remaining: 0
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Award points (10 per article)
    const pointsAwarded = 10;
    const newBalance = (user.tokenBalance || 0) + pointsAwarded;

    await context.env.DB.prepare(
      'UPDATE users SET tokenBalance = ? WHERE id = ?'
    ).bind(newBalance, user.id).run();

    // Record claim
    await context.env.DB.prepare(
      'INSERT INTO user_claims (id, userId, articleId, tokensEarned, claimedAt) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      `claim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user.id,
      articleId,
      pointsAwarded,
      new Date().toISOString()
    ).run();

    const remaining = 3 - ((todayClaims?.count || 0) + 1);

    console.log(`[NEWS-CLAIM] ${normalizedAddress} claimed ${pointsAwarded} points for article ${articleId}`);

    return new Response(JSON.stringify({
      success: true,
      pointsAwarded,
      newBalance,
      remaining,
      message: `Earned ${pointsAwarded} points! ${remaining} claims remaining today.`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[NEWS-CLAIM] Error:', error);
    return new Response(JSON.stringify({ 
      error: "Failed to claim points",
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
