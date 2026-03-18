import type { Env } from '../_middleware';

export async function onRequestGet(context: EventContext<Env, any, any>) {
  const { env } = context.data;
  
  try {
    // Test if we have the API key
    const hasApiKey = !!env.CRYPTOPANIC_API_KEY;
    const apiKeyLength = env.CRYPTOPANIC_API_KEY?.length || 0;
    
    // Test CryptoPanic API call
    let cryptoPanicTest = null;
    if (hasApiKey) {
      try {
        const cryptoPanicUrl = `https://cryptopanic.com/api/v1/posts/?auth_token=${env.CRYPTOPANIC_API_KEY}&public=true&kind=news&filter=hot&page=1`;
        const response = await fetch(cryptoPanicUrl);
        cryptoPanicTest = {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText
        };
      } catch (error) {
        cryptoPanicTest = {
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    
    return new Response(JSON.stringify({
      hasApiKey,
      apiKeyLength,
      cryptoPanicTest,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}