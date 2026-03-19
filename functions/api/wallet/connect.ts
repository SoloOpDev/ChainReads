import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { address } = await context.request.json() as { address: string };
    
    console.log('🔌 [CONNECT] Wallet connect request for:', address);
    
    if (!address) {
      return new Response(JSON.stringify({ message: "Wallet address required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Normalize to lowercase for DB lookup
    const normalizedAddress = address.toLowerCase();
    console.log('🔄 [CONNECT] Normalized address:', normalizedAddress);

    // Get user from D1 database
    const userQuery = await context.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(normalizedAddress).first();

    let user = userQuery;
    
    if (!user) {
      console.log('➕ [CONNECT] Creating new user');
      
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
      
      // Fetch the created user
      user = await context.env.DB.prepare(
        'SELECT * FROM users WHERE username = ?'
      ).bind(normalizedAddress).first();
      
      console.log('✅ [CONNECT] New user created with balance:', user?.tokenBalance);
    }

    // Get client IP
    const clientIp = context.request.headers.get('CF-Connecting-IP') || 
                     context.request.headers.get('X-Forwarded-For')?.split(',')[0] || 
                     'unknown';

    console.log('🔒 [CONNECT] Checking IP binding for:', clientIp);
    
    // Check IP binding
    const existingBinding = await context.env.DB.prepare(
      'SELECT * FROM ip_bindings WHERE ipAddress = ? AND bindingType = ?'
    ).bind(clientIp, 'predictions').first();
    
    if (existingBinding && existingBinding.walletAddress !== address) {
      console.log('❌ [CONNECT] IP already bound to different wallet');
      return new Response(JSON.stringify({ 
        message: "This IP address is already being used by another wallet. Please use a different device or contact support.",
        ipBound: true,
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create binding if it doesn't exist
    if (!existingBinding) {
      await context.env.DB.prepare(
        'INSERT INTO ip_bindings (id, ipAddress, bindingType, walletAddress, createdAt) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        `ip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        clientIp,
        'predictions',
        address,
        new Date().toISOString()
      ).run();
      console.log('🔗 [CONNECT] Created IP binding');
    }

    const response = {
      walletAddress: normalizedAddress,
      tokenBalance: user?.tokenBalance || 0,
      ipBound: true,
    };
    
    console.log('📤 [CONNECT] Sending response:', response);
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("Error connecting wallet:", error);
    return new Response(JSON.stringify({ 
      message: "Failed to connect wallet",
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
