import type { PagesFunction } from '@cloudflare/workers-types';
import { ethers } from 'ethers';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  BACKEND_WALLET_PRIVATE_KEY: string;
}

// Verify wallet signature
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
        error: "Authentication required",
        details: "Missing wallet address, signature, or timestamp"
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check timestamp (5 minute window)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    const timeDiff = Math.abs(now - requestTime);
    if (timeDiff > 5 * 60 * 1000) {
      return new Response(JSON.stringify({ 
        error: "Signature expired",
        details: "Please reconnect your wallet"
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
        error: "Invalid signature",
        details: "Signature verification failed"
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { tokenId, points } = await context.request.json() as { tokenId: number; points: number };
    const normalizedAddress = walletAddress.toLowerCase();

    console.log(`[EXCHANGE-SIGN] Request: wallet=${normalizedAddress}, tokenId=${tokenId}, points=${points}`);

    // Validate inputs
    if (!tokenId || tokenId < 1 || tokenId > 10) {
      return new Response(JSON.stringify({ error: "Invalid token ID (must be 1-10)" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!points || points < 300 || points > 10000) {
      return new Response(JSON.stringify({ error: "Invalid points amount (300-10000)" }), {
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
    if (user.tokenBalance < points) {
      return new Response(JSON.stringify({ 
        error: "Insufficient points",
        balance: user.tokenBalance,
        required: points
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check daily exchange limit
    const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const todayExchange = await context.env.DB.prepare(
      'SELECT * FROM exchanges WHERE walletAddress = ? AND date = ?'
    ).bind(normalizedAddress, today).first();

    if (todayExchange) {
      return new Response(JSON.stringify({ 
        error: "Already exchanged today",
        details: "You can only exchange once per day"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate nonce and expiration
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const expiration = Math.floor(Date.now() / 1000) + 300; // 5 minutes

    // Sign the exchange request
    const privateKey = context.env.BACKEND_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      console.error('[EXCHANGE-SIGN] Missing BACKEND_WALLET_PRIVATE_KEY');
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const wallet = new ethers.Wallet(privateKey);
    const hash = ethers.solidityPackedKeccak256(
      ['address', 'uint256', 'bytes32', 'uint256'],
      [normalizedAddress, points, nonce, expiration]
    );
    const backendSignature = await wallet.signMessage(ethers.getBytes(hash));

    console.log(`[EXCHANGE-SIGN] Generated signature for ${normalizedAddress}`);

    return new Response(JSON.stringify({
      nonce,
      expiration,
      signature: backendSignature,
      tokenId,
      points
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[EXCHANGE-SIGN] Error:', error);
    return new Response(JSON.stringify({ 
      error: "Failed to sign exchange",
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
