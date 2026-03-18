import { createDb } from '../server/db-d1';
import { D1Storage } from '../server/storage-d1';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2?: R2Bucket; // Optional until R2 is enabled
  CRYPTOPANIC_API_KEY: string;
  TELEGRAM_API_ID: string;
  TELEGRAM_API_HASH: string;
  TELEGRAM_PHONE: string;
  TELEGRAM_SESSION: string;
  TELEGRAM_TRADING_CHANNELS: string;
  TELEGRAM_AIRDROP_CHANNELS: string;
  BACKEND_WALLET_PRIVATE_KEY: string;
  ADMIN_SECRET: string;
  VITE_CONTRACT_ADDRESS: string;
  TELEGRAM_UPDATE_SECRET: string;
}

export async function onRequest(context: EventContext<Env, any, any>) {
  try {
    // Initialize database and storage
    const db = createDb(context.env.DB);
    const storage = new D1Storage(db);
    
    // Add to request context
    context.data = {
      ...context.data,
      db,
      storage,
      kv: context.env.KV,
      r2: context.env.R2,
      env: context.env
    };
    
    // Handle preflight requests
    if (context.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    
    // Continue to next handler
    const response = await context.next();
    
    // Add CORS headers to response
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return response;
  } catch (error) {
    console.error('Middleware error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}