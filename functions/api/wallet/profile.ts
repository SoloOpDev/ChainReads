import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const walletAddress = url.searchParams.get('wallet') || 
                         context.request.headers.get('x-wallet-address');

    if (!walletAddress) {
      return new Response(JSON.stringify({ 
        error: "Wallet address required" 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedAddress = walletAddress.toLowerCase();
    console.log('🔍 [WALLET-PROFILE] Request for:', normalizedAddress);

    // Get user
    const user = await context.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(normalizedAddress).first();

    if (!user) {
      console.log('❌ [WALLET-PROFILE] User not found, creating...');
      
      // Create new user
      await context.env.DB.prepare(
        'INSERT INTO users (id, username, password, tokenBalance, dailyClaims) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        normalizedAddress,
        'wallet-auth',
        0,
        0
      ).run();
      
      const newUser = await context.env.DB.prepare(
        'SELECT * FROM users WHERE username = ?'
      ).bind(normalizedAddress).first();
      
      if (!newUser) {
        return new Response(JSON.stringify({ 
          error: "Failed to create user" 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log('✅ [WALLET-PROFILE] New user created');
    }

    // Get client IP for binding check
    const clientIp = context.request.headers.get('CF-Connecting-IP') || 
                     context.request.headers.get('X-Forwarded-For')?.split(',')[0] || 
                     'unknown';

    // Check IP binding
    const existingBinding = await context.env.DB.prepare(
      'SELECT * FROM ip_bindings WHERE ipAddress = ? AND bindingType = ?'
    ).bind(clientIp, 'predictions').first();

    const finalUser = user || await context.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(normalizedAddress).first();

    const response = {
      walletAddress: normalizedAddress,
      tokenBalance: finalUser?.tokenBalance || 0,
      dailyClaims: finalUser?.dailyClaims || 0,
      ipBound: !!existingBinding,
      ipAddress: clientIp
    };

    console.log('📤 [WALLET-PROFILE] Sending response:', response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[WALLET-PROFILE] Error:', error);
    return new Response(JSON.stringify({ 
      error: "Failed to fetch profile",
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};