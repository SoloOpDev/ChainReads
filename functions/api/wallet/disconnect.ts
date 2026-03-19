import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequestPost: PagesFunction = async () => {
  try {
    return new Response(JSON.stringify({ 
      message: "Wallet disconnected successfully" 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("Error disconnecting wallet:", error);
    return new Response(JSON.stringify({ 
      message: "Failed to disconnect wallet" 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
