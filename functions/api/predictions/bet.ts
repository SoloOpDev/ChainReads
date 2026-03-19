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

    const { predictionId, direction, amount } = await context.request.json() as { 
      predictionId: string; 
      direction: string; 
      amount: number;
    };
    const normalizedAddress = walletAddress.toLowerCase();

    // Validate inputs
    if (!predictionId || !direction || !amount) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (direction !== 'up' && direction !== 'down') {
      return new Response(JSON.stringify({ error: "Invalid direction (must be 'up' or 'down')" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (amount < 10 || amount > 1000) {
      return new Response(JSON.stringify({ error: "Invalid amount (10-1000 points)" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user
    const user = await context.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(normalizedAddress).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check balance
    if (user.tokenBalance < amount) {
      return new Response(JSON.stringify({ 
        error: "Insufficient points",
        balance: user.tokenBalance,
        required: amount
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if prediction exists and is still open
    const prediction = await context.env.DB.prepare(
      'SELECT * FROM predictions WHERE id = ?'
    ).bind(predictionId).first();

    if (!prediction) {
      return new Response(JSON.stringify({ error: "Prediction not found" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (prediction.status !== 'open') {
      return new Response(JSON.stringify({ 
        error: "Prediction is closed",
        status: prediction.status
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user already bet on this prediction
    const existingBet = await context.env.DB.prepare(
      'SELECT * FROM prediction_bets WHERE predictionId = ? AND walletAddress = ?'
    ).bind(predictionId, normalizedAddress).first();

    if (existingBet) {
      return new Response(JSON.stringify({ 
        error: "Already placed bet",
        message: "You've already bet on this prediction"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Deduct points
    const newBalance = user.tokenBalance - amount;
    await context.env.DB.prepare(
      'UPDATE users SET tokenBalance = ? WHERE id = ?'
    ).bind(newBalance, user.id).run();

    // Record bet
    await context.env.DB.prepare(
      'INSERT INTO prediction_bets (id, predictionId, walletAddress, direction, amount, placedAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      `bet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      predictionId,
      normalizedAddress,
      direction,
      amount,
      new Date().toISOString()
    ).run();

    console.log(`[PREDICTION-BET] ${normalizedAddress} bet ${amount} points ${direction} on ${predictionId}`);

    return new Response(JSON.stringify({
      success: true,
      newBalance,
      bet: {
        predictionId,
        direction,
        amount,
        placedAt: new Date().toISOString()
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[PREDICTION-BET] Error:', error);
    return new Response(JSON.stringify({ 
      error: "Failed to place bet",
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
