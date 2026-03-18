export async function onRequest(context: any): Promise<Response> {
  try {
    console.log('[ACADEMIC API] Starting academic endpoint');
    let guides: any[] = [];
    
    try {
      // Try to fetch the guides file from the public directory
      const baseUrl = new URL(context.request.url).origin;
      const guidesUrl = `${baseUrl}/coingecko-guides.json`;
      console.log('[ACADEMIC API] Fetching from:', guidesUrl);
      
      const guidesResponse = await fetch(guidesUrl);
      
      if (guidesResponse.ok) {
        const guidesData = await guidesResponse.json();
        console.log('[ACADEMIC API] Parsed data type:', Array.isArray(guidesData) ? 'array' : typeof guidesData);
        
        // Handle both array format and {guides: []} format
        guides = Array.isArray(guidesData) ? guidesData : (guidesData.guides || []);
        console.log('[ACADEMIC API] Guides count:', guides.length);
        
        if (guides.length > 0) {
          console.log('[ACADEMIC API] First guide:', guides[0].title);
        }
      } else {
        console.log('[ACADEMIC API] Could not fetch coingecko-guides.json, status:', guidesResponse.status);
        // Fallback to sample data
        guides = getSampleGuides();
      }
    } catch (err) {
      console.error('[ACADEMIC API] Error reading file:', err);
      console.log('[ACADEMIC API] Using fallback sample data');
      // Fallback to sample data
      guides = getSampleGuides();
    }

    const articles = guides.slice(0, 50).map((guide: any, index: number) => ({
      id: guide.id || `academic-${index + 1}`,
      title: guide.title || 'Crypto Guide',
      description: guide.description || guide.title || 'Learn about cryptocurrency',
      image: guide.image || `https://images.unsplash.com/photo-${1518546305927 + index}?w=400&h=250&fit=crop`,
      category: guide.category || 'Guide',
      readTime: guide.readTime || `${Math.floor(Math.random() * 10) + 5} min read`,
    }));

    console.log('[ACADEMIC API] Returning articles count:', articles.length);
    
    return new Response(JSON.stringify({ articles }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (error) {
    console.error("[ACADEMIC API] Error fetching academic articles:", error);
    return new Response(JSON.stringify({ message: "Failed to fetch academic articles" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

function getSampleGuides() {
  return [
    {
      id: "academic-what-is-tempo-stablechain",
      title: "What Is Tempo? Stripe's Upcoming Payments Stablechain",
      description: "Read on to learn more about Tempo, Stripe's upcoming stablechain built and supported by industry giants such as OpenAI, Shopify and more!",
      image: "https://assets.coingecko.com/coingecko/public/ckeditor_assets/pictures/34452/content_What_Is_Tempo_.webp",
      category: "Guides",
      readTime: "5 min read"
    },
    {
      id: "academic-what-are-solana-token-accounts",
      title: "What Are Solana Token Accounts: Reclaiming Free SOL in Your Wallets",
      description: "Did you know, you could have free SOL lying unclaimed in your wallets? Read on to learn more how this happens with Solana token accounts!",
      image: "https://assets.coingecko.com/coingecko/public/ckeditor_assets/pictures/34430/content_solana_token_accounts_cover.webp",
      category: "Guides",
      readTime: "5 min read"
    },
    {
      id: "academic-defi-basics",
      title: "DeFi Basics: Understanding Decentralized Finance",
      description: "Learn the fundamentals of DeFi, including lending, borrowing, and yield farming in the decentralized finance ecosystem.",
      image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=250&fit=crop",
      category: "DeFi",
      readTime: "8 min read"
    },
    {
      id: "academic-nft-guide",
      title: "Complete Guide to NFTs: Beyond Digital Art",
      description: "Explore the world of Non-Fungible Tokens, their use cases, and how they're revolutionizing digital ownership.",
      image: "https://images.unsplash.com/photo-1640161704729-cbe966a08476?w=400&h=250&fit=crop",
      category: "NFTs",
      readTime: "6 min read"
    },
    {
      id: "academic-blockchain-security",
      title: "Blockchain Security: Protecting Your Crypto Assets",
      description: "Essential security practices for keeping your cryptocurrency and digital assets safe from hackers and scams.",
      image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400&h=250&fit=crop",
      category: "Security",
      readTime: "10 min read"
    }
  ];
}