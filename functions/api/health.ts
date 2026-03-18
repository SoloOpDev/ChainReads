export async function onRequestGet() {
  return new Response(JSON.stringify({ 
    status: 'ok',
    platform: 'cloudflare',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}