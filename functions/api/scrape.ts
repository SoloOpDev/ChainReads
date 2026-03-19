export async function onRequestGet(context: any): Promise<Response> {
  try {
    const url = new URL(context.request.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response(JSON.stringify({ 
        error: "URL parameter is required" 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`[SCRAPE API] Scraping URL: ${targetUrl}`);
    
    // Basic URL validation
    let validUrl: URL;
    try {
      validUrl = new URL(targetUrl);
    } catch {
      return new Response(JSON.stringify({ 
        error: "Invalid URL format" 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Only allow HTTPS URLs for security
    if (validUrl.protocol !== 'https:') {
      return new Response(JSON.stringify({ 
        error: "Only HTTPS URLs are allowed" 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fetch the target URL with proper headers
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      console.log(`[SCRAPE API] HTTP ${response.status}: ${response.statusText}`);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
        status: response.status
      }), {
        status: response.status >= 400 && response.status < 500 ? response.status : 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const html = await response.text();
    console.log(`[SCRAPE API] Fetched ${html.length} characters`);
    
    // Enhanced content extraction
    let title = '';
    let content = '';
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }
    
    // CoinDesk-specific content extraction with multiple strategies
    if (targetUrl.includes('coindesk.com')) {
      console.log('[SCRAPE API] Using CoinDesk-specific extraction');
      
      // Strategy 1: Look for article body with various class names and data attributes
      const articleBodySelectors = [
        /<div[^>]*class="[^"]*articleBody[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*content-body[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*data-module="ArticleBody"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*data-testid="article-body"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*data-component="ArticleBody"[^>]*>(.*?)<\/div>/is,
        /<section[^>]*data-module="ArticleBody"[^>]*>(.*?)<\/section>/is
      ];
      
      for (const selector of articleBodySelectors) {
        const match = html.match(selector);
        if (match && match[1] && match[1].length > content.length) {
          content = match[1];
          console.log('[SCRAPE API] Found content with selector:', selector.toString().substring(0, 80));
          break;
        }
      }
      
      // Strategy 2: Look for main content area
      if (!content || content.length < 200) {
        const mainSelectors = [
          /<main[^>]*>(.*?)<\/main>/is,
          /<article[^>]*>(.*?)<\/article>/is,
          /<section[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/section>/is,
          /<div[^>]*class="[^"]*main[^"]*"[^>]*>(.*?)<\/div>/is
        ];
        
        for (const selector of mainSelectors) {
          const match = html.match(selector);
          if (match && match[1] && match[1].length > content.length) {
            content = match[1];
            console.log('[SCRAPE API] Found content with main selector:', selector.toString().substring(0, 80));
            break;
          }
        }
      }
      
      // Strategy 3: CoinDesk often has content in specific div structures - try broader patterns
      if (!content || content.length < 200) {
        // Look for divs that contain multiple paragraphs (likely article content)
        const contentDivs = html.match(/<div[^>]*>[\s\S]*?<p[^>]*>[\s\S]*?<\/p>[\s\S]*?<p[^>]*>[\s\S]*?<\/p>[\s\S]*?<\/div>/gi);
        if (contentDivs) {
          // Find the div with the most paragraph content
          let bestDiv = '';
          let maxParagraphs = 0;
          
          contentDivs.forEach(div => {
            const paragraphCount = (div.match(/<p[^>]*>/g) || []).length;
            if (paragraphCount > maxParagraphs) {
              maxParagraphs = paragraphCount;
              bestDiv = div;
            }
          });
          
          if (bestDiv && maxParagraphs >= 3) {
            content = bestDiv;
            console.log(`[SCRAPE API] Found content div with ${maxParagraphs} paragraphs`);
          }
        }
      }
    }
    
    // Generic content extraction if CoinDesk-specific didn't work
    if (!content || content.length < 200) {
      console.log('[SCRAPE API] Using generic extraction');
      
      // Strategy 1: Look for common article containers
      const selectors = [
        /<article[^>]*>(.*?)<\/article>/is,
        /<div[^>]*class="[^"]*article[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*post[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*entry[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*body[^"]*"[^>]*>(.*?)<\/div>/is,
        /<main[^>]*>(.*?)<\/main>/is,
        /<div[^>]*id="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*id="[^"]*article[^"]*"[^>]*>(.*?)<\/div>/is,
        /<section[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/section>/is
      ];
      
      for (const selector of selectors) {
        const match = html.match(selector);
        if (match && match[1].length > content.length) {
          content = match[1];
          console.log(`[SCRAPE API] Found content with selector: ${selector.toString().substring(0, 50)}...`);
        }
      }
      
      // Strategy 2: If still no content, look for divs with multiple paragraphs
      if (!content || content.length < 200) {
        console.log('[SCRAPE API] Trying paragraph-based extraction');
        const contentDivs = html.match(/<div[^>]*>[\s\S]*?<p[^>]*>[\s\S]*?<\/p>[\s\S]*?<p[^>]*>[\s\S]*?<\/p>[\s\S]*?<\/div>/gi);
        if (contentDivs) {
          let bestDiv = '';
          let maxParagraphs = 0;
          
          contentDivs.forEach(div => {
            const paragraphCount = (div.match(/<p[^>]*>/g) || []).length;
            const textLength = div.replace(/<[^>]*>/g, '').trim().length;
            
            // Prefer divs with more paragraphs and substantial text
            if (paragraphCount >= 3 && textLength > 500 && paragraphCount > maxParagraphs) {
              maxParagraphs = paragraphCount;
              bestDiv = div;
            }
          });
          
          if (bestDiv) {
            content = bestDiv;
            console.log(`[SCRAPE API] Found content div with ${maxParagraphs} paragraphs via generic extraction`);
          }
        }
      }
    }
    
    // Extract meta description as fallback
    if (!content || content.length < 100) {
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
      if (descMatch) {
        content = `<p>${descMatch[1].trim()}</p>`;
        console.log('[SCRAPE API] Using meta description as fallback');
      }
    }
    
    // If still no content, try to extract paragraphs
    if (!content || content.length < 100) {
      const paragraphs = html.match(/<p[^>]*>([^<]+(?:<[^>]*>[^<]*)*)<\/p>/gi);
      if (paragraphs && paragraphs.length > 2) {
        content = paragraphs.slice(0, 8).join('\n');
        console.log(`[SCRAPE API] Extracted ${paragraphs.length} paragraphs as fallback`);
      }
    }
    
    // Clean up content - AGGRESSIVELY remove ALL website junk
    if (content) {
      // First pass - remove major structural elements
      content = content
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<nav[^>]*>.*?<\/nav>/gis, '')
        .replace(/<header[^>]*>.*?<\/header>/gis, '')
        .replace(/<footer[^>]*>.*?<\/footer>/gis, '')
        .replace(/<aside[^>]*>.*?<\/aside>/gis, '')
        .replace(/<form[^>]*>.*?<\/form>/gis, '')
        .replace(/<iframe[^>]*>.*?<\/iframe>/gis, '')
        .replace(/<!--.*?-->/gs, '');

      // Second pass - remove specific junk divs but preserve content divs
      content = content
        .replace(/<div[^>]*class="[^"]*(?:sidebar|nav|menu|header|footer|ad|advertisement|promo|related|recommend)[^"]*"[^>]*>.*?<\/div>/gis, '')
        .replace(/<section[^>]*class="[^"]*(?:sidebar|nav|menu|header|footer|ad|advertisement|promo|related|recommend)[^"]*"[^>]*>.*?<\/section>/gis, '');

      // Third pass - remove specific unwanted links but preserve article links
      content = content
        .replace(/<a[^>]*href="[^"]*(?:subscribe|newsletter|follow|share|twitter|facebook)[^"]*"[^>]*>.*?<\/a>/gis, '')
        .replace(/<button[^>]*>.*?<\/button>/gis, '')
        .replace(/<input[^>]*>/gis, '');

      // Fourth pass - remove images and media
      content = content
        .replace(/<img[^>]*>/gis, '')
        .replace(/<video[^>]*>.*?<\/video>/gis, '')
        .replace(/<audio[^>]*>.*?<\/audio>/gis, '');

      // Fifth pass - clean up some attributes but preserve structure
      content = content
        .replace(/\s+style="[^"]*"/gis, '')
        .replace(/\s+data-[^=]*="[^"]*"/gis, '');

      // Sixth pass - extract paragraphs and headings with moderate filtering
      const cleanParagraphs = [];
      const pMatches = content.match(/<p[^>]*>(.*?)<\/p>/gis);
      const h1Matches = content.match(/<h1[^>]*>(.*?)<\/h1>/gis);
      const h2Matches = content.match(/<h2[^>]*>(.*?)<\/h2>/gis);
      const h3Matches = content.match(/<h3[^>]*>(.*?)<\/h3>/gis);

      // Combine all text content - filter out obvious junk but keep real content
      let cleanContent = '';
      
      if (h1Matches) {
        h1Matches.forEach(h => {
          const text = h.replace(/<[^>]*>/g, '').trim();
          if (text.length > 5 && 
              !text.toLowerCase().includes('subscribe') &&
              !text.toLowerCase().includes('newsletter') &&
              !text.toLowerCase().includes('more for you') &&
              !text.toLowerCase().includes('related articles')) {
            cleanContent += `<h1>${text}</h1>\n`;
          }
        });
      }
      
      if (h2Matches) {
        h2Matches.forEach(h => {
          const text = h.replace(/<[^>]*>/g, '').trim();
          if (text.length > 3 && 
              !text.toLowerCase().includes('subscribe') &&
              !text.toLowerCase().includes('newsletter') &&
              !text.toLowerCase().includes('more for you') &&
              !text.toLowerCase().includes('related articles')) {
            cleanContent += `<h2>${text}</h2>\n`;
          }
        });
      }

      if (h3Matches) {
        h3Matches.forEach(h => {
          const text = h.replace(/<[^>]*>/g, '').trim();
          if (text.length > 3 && 
              !text.toLowerCase().includes('subscribe') &&
              !text.toLowerCase().includes('newsletter') &&
              !text.toLowerCase().includes('more for you') &&
              !text.toLowerCase().includes('related articles')) {
            cleanContent += `<h3>${text}</h3>\n`;
          }
        });
      }

      if (pMatches) {
        pMatches.forEach(p => {
          const text = p.replace(/<[^>]*>/g, '').trim();
          // Keep most paragraphs, only filter out obvious junk
          if (text.length > 15 && 
              !text.toLowerCase().includes('subscribe') &&
              !text.toLowerCase().includes('newsletter') &&
              !text.toLowerCase().includes('follow us') &&
              !text.toLowerCase().includes('more for you') &&
              !text.toLowerCase().includes('related articles') &&
              !text.toLowerCase().includes('advertisement') &&
              !text.toLowerCase().includes('sponsored')) {
            cleanContent += `<p>${text}</p>\n`;
          }
        });
      }

      // If we got clean content, use it, otherwise fall back to original cleaned content
      content = cleanContent.length > 50 ? cleanContent : content;

      // Final cleanup and safety check
      content = content
        .replace(/\s+/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();

      // Final safety check - remove any remaining junk patterns
      content = content
        .replace(/<p[^>]*>.*?(More For You|Related|Latest|Top Stories|CoinDesk|minutes ago|hours ago|Edited by).*?<\/p>/gis, '')
        .replace(/<h[1-6][^>]*>.*?(More For You|Related|Latest|Top Stories).*?<\/h[1-6]>/gis, '')
        .trim();
    }
    
    const result = {
      url: targetUrl,
      title: title || 'Untitled',
      content: content || 'Content extraction not available for this URL.',
      success: !!content && content.length > 30,
      strategy: targetUrl.includes('coindesk.com') ? 'coindesk' : 'generic',
      contentLength: content?.length || 0
    };
    
    console.log(`[SCRAPE API] Extraction complete:`, {
      title: title?.substring(0, 50),
      contentLength: content?.length || 0,
      success: result.success,
      strategy: result.strategy
    });
    
    return new Response(JSON.stringify(result), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800', // 30 minutes cache
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error("[SCRAPE API] Error:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to scrape URL",
      message: error instanceof Error ? error.message : "Unknown error",
      success: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}