import type { Env } from '../../_middleware';

export async function onRequestPost(context: EventContext<Env, any, any>) {
  const { env } = context.data;
  
  try {
    const body = await context.request.json();
    const { secret } = body;
    
    // Verify secret
    if (!secret || secret !== env.ADMIN_SECRET) {
      return new Response(JSON.stringify({ error: 'Invalid admin secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Trigger GitHub Actions workflow
    const githubToken = env.GITHUB_TOKEN;
    if (!githubToken) {
      return new Response(JSON.stringify({ 
        error: 'GitHub token not configured',
        message: 'Set GITHUB_TOKEN in Cloudflare secrets to enable workflow triggers'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const response = await fetch('https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/actions/workflows/update-telegram.yml/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main' })
    });
    
    if (response.ok) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Telegram update workflow triggered successfully'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        error: 'Failed to trigger workflow',
        status: response.status
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('❌ Failed to trigger telegram update:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to trigger update',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}