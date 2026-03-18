export async function onRequestGet() {
  return new Response(JSON.stringify({ 
    ok: true, 
    env: 'cloudflare',
    timestamp: new Date().toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}