export async function onRequest(context: any): Promise<Response> {
  try {
    const { id } = context.params;
    console.log(`[ARTICLE API] Looking for article with ID: ${id}`);
    
    // Handle academic articles
    if (id.startsWith('academic-')) {
      try {
        // Try to fetch the guides file from the public directory
        const baseUrl = new URL(context.request.url).origin;
        const guidesUrl = `${baseUrl}/coingecko-guides.json`;
        console.log('[ARTICLE API] Fetching academic guides from:', guidesUrl);
        
        const guidesResponse = await fetch(guidesUrl);
        
        if (guidesResponse.ok) {
          const guidesData = await guidesResponse.json();
          const guides = Array.isArray(guidesData) ? guidesData : (guidesData.guides || []);
          const article = guides.find((g: any) => g.id === id);
          
          if (!article) {
            console.log(`[ARTICLE API] Academic article not found: ${id}`);
            return new Response(JSON.stringify({ message: "Academic article not found" }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          console.log(`[ARTICLE API] Found academic article: ${article.title}`);
          return new Response(JSON.stringify({
            ...article,
            content: article.fullContent || article.description || '',
            contentStrategy: 'academic'
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        } else {
          console.log('[ARTICLE API] Could not fetch coingecko-guides.json, status:', guidesResponse.status);
        }
      } catch (err) {
        console.error('[ARTICLE API] Error reading academic articles:', err);
      }
      
      // Fallback for academic articles
      return new Response(JSON.stringify({
        id: id,
        title: "Academic Article",
        description: "This academic article is currently unavailable.",
        content: "<p>This academic article content is currently being processed. Please try again later.</p>",
        contentStrategy: 'academic-fallback'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
    
    // Handle regular news articles - fetch from news API and find by ID
    try {
      console.log(`[ARTICLE API] Fetching news articles to find ID: ${id}`);
      const baseUrl = new URL(context.request.url).origin;
      const newsUrl = `${baseUrl}/api/news?limit=100`;
      
      const newsResponse = await fetch(newsUrl);
      if (newsResponse.ok) {
        const newsData = await newsResponse.json();
        const articles = newsData.results || [];
        const article = articles.find((a: any) => String(a.id) === String(id));
        
        if (article) {
          console.log(`[ARTICLE API] Found news article: ${article.title}`);
          return new Response(JSON.stringify({
            ...article,
            content: '', // Don't use RSS content as fallback - let scraper handle it
            contentStrategy: 'news'
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=600',
            },
          });
        }
      }
    } catch (err) {
      console.error('[ARTICLE API] Error fetching news articles:', err);
    }
    
    // Article not found
    return new Response(JSON.stringify({
      message: "Article not found",
      id: id
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error("[ARTICLE API] Error fetching article:", error);
    return new Response(JSON.stringify({ 
      message: "Failed to fetch article",
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}