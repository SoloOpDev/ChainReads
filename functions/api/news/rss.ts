// RSS parser for Cloudflare Workers (no Node.js dependencies)
export async function fetchCoinDeskRSS() {
  try {
    const response = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/');
    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status}`);
    }
    
    const rssText = await response.text();
    
    // Simple XML parsing for RSS (since we can't use rss-parser in Workers)
    const items = parseRSSItems(rssText);
    
    const results = items.slice(0, 50).map((item, index) => ({
      id: (index + 1).toString(),
      title: item.title || '',
      description: item.description || '',
      content: '', // Don't use RSS content as it contains junk - let scraper handle it
      source: {
        title: 'CoinDesk',
        domain: 'coindesk.com',
      },
      published_at: item.pubDate || new Date().toISOString(),
      created_at: new Date().toISOString(),
      image: item.image || null,
      original_url: item.link || '',
      url: item.link || '',
      kind: 'article',
      author: item.author || null,
      instruments: null,
      votes: null
    }));

    console.log('✅ RSS parsed:', results.length, 'articles');
    return { results };
  } catch (error) {
    console.error('❌ Error fetching RSS feed:', error);
    throw error;
  }
}

function parseRSSItems(rssText: string) {
  const items: any[] = [];
  
  // Extract items using regex (simple but effective for RSS)
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(rssText)) !== null) {
    const itemXml = match[1];
    
    const item = {
      title: extractTag(itemXml, 'title'),
      description: extractTag(itemXml, 'description'),
      content: '', // Don't use RSS content as it contains junk - let scraper handle it
      link: extractTag(itemXml, 'link'),
      pubDate: extractTag(itemXml, 'pubDate'),
      author: extractTag(itemXml, 'dc:creator') || extractTag(itemXml, 'author'),
      image: extractImageFromContent(itemXml)
    };
    
    items.push(item);
  }
  
  return items;
}

function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  if (match && match[1]) {
    // Decode HTML entities and clean up
    return match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
  return null;
}

function extractImageFromContent(xml: string): string | null {
  // Try to extract image from various sources
  const patterns = [
    /<media:content[^>]+url="([^"]+)"/i,
    /<media:thumbnail[^>]+url="([^"]+)"/i,
    /<enclosure[^>]+url="([^"]+)"[^>]+type="image/i,
    /<img[^>]+src="([^"]+)"/i
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}