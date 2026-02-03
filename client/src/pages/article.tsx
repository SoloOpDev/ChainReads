import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Clock, Sparkles } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import type { CryptoPanicResponse } from "@shared/schema";
import { getApiUrl } from "@/lib/api";
import { createPortal } from "react-dom";
import { getPointsSelection } from "@/lib/points-selection";
import { getAuthHeaders } from "@/lib/auth";

export default function ArticlePage({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [timer, setTimer] = useState(10);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [showClaimHint, setShowClaimHint] = useState(false);
  const [isPaywalled, setIsPaywalled] = useState(false);
  const [pointsClaimed, setPointsClaimed] = useState(false);
  const [pointsBusy, setPointsBusy] = useState(false);
  const [pointsResult, setPointsResult] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Detect if this is an academic article
  const isAcademic = params.id.startsWith('academic-');

  // Get wallet address
  useEffect(() => {
    const getAddress = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
          }
        } catch (error) {
          console.error('Error getting wallet:', error);
        }
      }
    };
    getAddress();

    if (typeof window.ethereum !== 'undefined') {
      const handleAccountsChanged = (accounts: string[]) => {
        setWalletAddress(accounts.length > 0 ? accounts[0] : null);
      };
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        if (window.ethereum?.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, []);

  // Check if this article is already claimed
  const { data: claimedData, refetch: refetchClaimed } = useQuery({
    queryKey: ['/api/news/claimed', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return { claimed: [] };
      
      const normalizedAddress = walletAddress.toLowerCase();
      const res = await fetch(`/api/news/claimed?wallet=${normalizedAddress}`);
      
      if (!res.ok) return { claimed: [] };
      return res.json();
    },
    enabled: !!walletAddress && !isAcademic,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const isArticleClaimed = claimedData?.claimed?.includes(String(params.id)) || false;
  const canClaimMore = (claimedData?.claimed?.length || 0) < 3;
  
  // Debug logging for claim status
  useEffect(() => {
    console.log('🎯 ARTICLE CLAIM STATUS:', {
      articleId: params.id,
      articleIdType: typeof params.id,
      isArticleClaimed,
      canClaimMore,
      claimedCount: claimedData?.claimed?.length || 0,
      claimedArticles: claimedData?.claimed || [],
      claimedArticlesTypes: claimedData?.claimed?.map((id: any) => typeof id) || []
    });
  }, [isArticleClaimed, canClaimMore, claimedData, params.id]);
  
  // Fetch academic articles if this is an academic article
  const { data: academicData } = useQuery<{ articles: any[] }>({
    queryKey: ["/api/academic"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/academic"));
      if (!res.ok) throw new Error("Failed to fetch academic articles");
      return res.json();
    },
    enabled: isAcademic,
    staleTime: 30 * 60 * 1000,
  });
  
  // Clean content - extract from wrapper divs if needed
  const cleanContent = (html: string): string => {
    if (!html) return '';
    
    console.log('🧹 RAW HTML:', { length: html.length, preview: html.substring(0, 500) });
    
    // Check if content is wrapped in a div with class that might be hidden
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Log what we're actually getting
    console.log('🧹 PARSED:', {
      bodyChildren: doc.body.children.length,
      firstChild: doc.body.firstElementChild?.tagName,
      firstChildClass: doc.body.firstElementChild?.className,
      textContent: doc.body.textContent?.substring(0, 200)
    });
    
    // If there's a wrapper div, extract its innerHTML
    if (doc.body.children.length === 1 && doc.body.firstElementChild?.tagName === 'DIV') {
      const wrapper = doc.body.firstElementChild as HTMLElement;
      console.log('🧹 UNWRAPPING DIV');
      return wrapper.innerHTML;
    }
    
    return html;
  };
  
  const { data: newsData } = useQuery<CryptoPanicResponse>({
    queryKey: ["/api/news"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/news"));
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const articleId = params.id;
  
  // Find article from either news or academic data
  const article = isAcademic 
    ? academicData?.articles?.find((a: any) => a.id === articleId)
    : newsData?.results?.find((a: any) => a.id.toString() === articleId);
  
  // Log article when found
  useEffect(() => {
    if (article) {
      const articleAny = article as any;
      console.log('📄 Article found:', {
        id: article.id,
        title: article.title?.substring(0, 50),
        hasContent: !!articleAny.content,
        contentLength: articleAny.content?.length || 0,
        hasDescription: !!article.description,
        descriptionLength: article.description?.length || 0
      });
    }
  }, [article]);

  // Academic articles need the full fetch
  const articleDetailEnabled = isAcademic 
    ? !!params.id
    : !!params.id && !!newsData && (!article || !(article as any).content || (article as any).content.length < 100);
  
  const { data: articleDetail } = useQuery<any>({
    queryKey: ["/api/article", params.id],
    queryFn: async () => {
      console.log('🔄 Fetching articleDetail from:', getApiUrl(`/api/article/${params.id}`));
      const res = await fetch(getApiUrl(`/api/article/${params.id}`), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      console.log('📡 ArticleDetail response:', res.status);
      if (!res.ok) throw new Error('Failed to fetch article details');
      const data = await res.json();
      console.log('✅ ArticleDetail received:', { hasContent: !!data.content, contentLength: data.content?.length });
      return data;
    },
    enabled: articleDetailEnabled,
    staleTime: 0,
    gcTime: 0,
  });

  const articleIndex = newsData?.results?.findIndex(a => a.id.toString() === params.id) ?? -1;
  
  // Debug news data loading
  useEffect(() => {
    console.log('📰 NEWS DATA STATUS:', {
      hasNewsData: !!newsData,
      resultsCount: newsData?.results?.length,
      articleId: params.id,
      articleIndex,
      foundArticle: !!newsData?.results?.find(a => a.id.toString() === params.id)
    });
  }, [newsData, params.id, articleIndex]);
  
  // Use the SAME lucky article selection as home page
  const luckyArticles = useMemo(() => {
    return newsData?.results?.length ? getPointsSelection(newsData.results.length) : [];
  }, [newsData?.results?.length]);
  
  // Reward logic - check if article has points reward
  const hasPointsReward = !isAcademic && articleIndex >= 0 && luckyArticles.includes(articleIndex);

  // Debug logging
  useEffect(() => {
    console.log('🎁 CLAIM DEBUG:', {
      articleId: params.id,
      articleIndex,
      luckyArticles,
      hasPointsReward,
      isArticleClaimed,
      canClaimMore,
      isTimerActive,
      showClaimHint,
      timer
    });
  }, [articleIndex, luckyArticles, hasPointsReward, isArticleClaimed, canClaimMore, isTimerActive, showClaimHint, timer]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerActive && timer > 0) {
      interval = setInterval(() => {
        setTimer(timer - 1);
      }, 1000);
    } else if (timer === 0 && isTimerActive) {
      setIsTimerActive(false);
      if (hasPointsReward && !pointsClaimed && !isArticleClaimed && canClaimMore) {
        setShowClaimHint(true);
      }
    }
    return () => clearInterval(interval);
  }, [timer, isTimerActive, hasPointsReward, pointsClaimed, isArticleClaimed, canClaimMore]);

  useEffect(() => {
    // Points rewards: Start timer immediately if article is claimable
    if (hasPointsReward && !pointsClaimed && !isArticleClaimed && canClaimMore) {
      setIsTimerActive(true);
      setTimer(10);
    } else {
      setIsTimerActive(false);
      setTimer(10);
      setShowClaimHint(false);
    }
    return () => {
      setIsTimerActive(false);
      setShowClaimHint(false);
    };
  }, [hasPointsReward, pointsClaimed, isArticleClaimed, canClaimMore]);

  const handlePointsClaim = async () => {
    try {
      console.log('🎯 Starting points claim...');
      setPointsBusy(true);
      setPointsResult('Claiming points...');

      console.log('📤 Sending claim request:', { articleId: params.id });

      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }

      const normalizedAddress = walletAddress.toLowerCase();

      // Simple sign function using window.ethereum
      const signMessage = async (message: string): Promise<string> => {
        if (!window.ethereum) throw new Error("No wallet found");
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, walletAddress],
        });
        return signature as string;
      };

      // Get authentication headers with signature
      const authHeaders = await getAuthHeaders(walletAddress, signMessage);

      const response = await fetch(getApiUrl('/api/news/claim'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ 
          articleId: params.id
        }),
      });

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.log('❌ Error response:', error);
        throw new Error(error.error || 'Failed to claim points');
      }

      const data = await response.json();
      console.log('✅ Success response:', data);
      
      setPointsClaimed(true);
      setIsTimerActive(false);
      setShowClaimHint(false);
      setPointsResult(`🎉 You earned ${data.pointsEarned} points! (${data.claimedCount}/3 articles claimed today)`);
      
      // Invalidate and refetch immediately
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/news/claimed'] });
      
      // Force immediate refetch of claimed data for THIS page
      await refetchClaimed();
      
      toast({
        title: "Points Claimed!",
        description: `You earned 10 points! ${data.remaining > 0 ? `Claim ${data.remaining} more article${data.remaining > 1 ? 's' : ''} for 30 total.` : 'All 3 articles claimed!'}`,
      });
      
    } catch (error: any) {
      console.error('❌ Points claim error:', error);
      let errorMsg = 'Failed to claim points. Please try again.';
      
      if (error?.message?.includes('already claimed')) {
        errorMsg = 'Points already claimed for this article.';
      }
      
      setPointsResult(errorMsg);
      
      toast({
        title: "Claim Failed",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setPointsBusy(false);
    }
  };

  useEffect(() => {
    // ALWAYS clear sessionStorage to force fresh scraping
    try {
      sessionStorage.removeItem(`article:${articleId}`);
    } catch {}
  }, [articleId]);

  useEffect(() => {
    if (!article) return;
    
    // Academic articles - wait for API, don't use list content
    if (isAcademic) {
      return;
    }
    
    // Check if article already has content from RSS
    const articleWithContent = article as any;
    const hasRSSContent = articleWithContent.content && articleWithContent.content.length > 200;
    
    console.log('🔍 Article data:', { 
      title: article.title, 
      original_url: article.original_url,
      hasDescription: !!article.description,
      descriptionLength: article.description?.length || 0,
      hasRSSContent,
      rssContentLength: articleWithContent.content?.length || 0
    });
    
    // Got RSS content already? Use it
    if (hasRSSContent) {
      console.log('✅ Using RSS content directly, length:', articleWithContent.content.length);
      setFullContent(articleWithContent.content);
      return;
    }
    
    if (article.original_url) {
      const ctrl = new AbortController();
      const scrapeUrl = getApiUrl(`/api/scrape?url=${encodeURIComponent(article.original_url)}`);
      console.log('🌐 Fetching scrape for:', article.original_url);
      console.log('🌐 Scrape URL:', scrapeUrl);
      
      fetch(scrapeUrl, { signal: ctrl.signal })
        .then(async res => {
          console.log('📡 Scrape response status:', res?.status);
          if (!res.ok && res.status !== 304) {
            const errorData = await res.json().catch(() => ({}));
            console.log('⚠️ Scrape error data:', errorData);
            if (errorData?.message?.toLowerCase().includes('paywall')) {
              setIsPaywalled(true);
            }
            return null;
          }
          return res.json();
        })
        .then(data => {
          console.log('📦 Scrape data:', { 
            hasContent: !!data?.content, 
            contentLength: data?.content?.length || 0,
            strategy: data?.strategy,
            preview: data?.content?.substring(0, 300)
          });
          if (data?.content) {
            console.log('✅ Setting scraped content, length:', data.content.length);
            setFullContent(data.content);
            try {
              sessionStorage.setItem(`article:${articleId}` , JSON.stringify({ content: data.content, ts: Date.now() }));
            } catch {}
          } else {
            console.warn('⚠️ Scrape returned no content, data:', data);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('❌ Scrape failed:', err.message, err);
          }
        });
      return () => ctrl.abort();
    } else {
      console.warn('⚠️ No original_url found for article');
    }
  }, [article, articleId, isAcademic]);

  // Use articleDetail immediately if available
  useEffect(() => {
    if (articleDetail?.content && typeof articleDetail.content === 'string') {
      console.log('📄 Using articleDetail content, length:', articleDetail.content.length);
      console.log('📄 Content preview:', articleDetail.content.substring(0, 500));
      setFullContent(articleDetail.content);
      try {
        sessionStorage.setItem(`article:${articleId}` , JSON.stringify({ content: articleDetail.content, ts: Date.now() }));
      } catch {}
    }
  }, [articleDetail, articleId]);

  // Debug: Log when fullContent changes
  useEffect(() => {
    console.log('🎨 FULLCONTENT STATE CHANGED:', {
      hasContent: !!fullContent,
      length: fullContent?.length,
      preview: fullContent?.substring(0, 300),
      willRender: !!fullContent
    });
  }, [fullContent]);

  if (!newsData && !article) {
    return (
      <div className="flex min-h-full flex-col">
        <div className="sticky top-[49px] z-40 -mt-px border-b bg-background px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="-ml-2 h-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex min-h-full flex-col">
        <div className="sticky top-[49px] z-40 -mt-px border-b bg-background px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="-ml-2 h-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Article not found</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {isAcademic && createPortal(
        // Academic back button - floats on top
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setLocation("/academic")} 
          className="h-8 px-3 text-sm bg-orange-900/90 hover:bg-orange-800 text-white border border-orange-700/60 backdrop-blur-md shadow-lg transition-all"
          style={{ position: 'fixed', top: '8px', left: '24px', zIndex: 9999 }}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back
        </Button>,
        document.body
      )}
      
      {!isAcademic && createPortal(
        // News article header - sticks to top
        <div className="fixed top-0 left-0 right-0 z-40 backdrop-blur-xl bg-gray-900/40" style={{ position: 'fixed' }}>
          <div className="flex h-12 items-center justify-between px-8 w-full">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="-ml-2 h-8 text-white hover:text-white hover:bg-white/10">
              <ArrowLeft className="mr-2 h-4 w-4 text-white" />
              Back
            </Button>
            <div className="flex-1" />
            {hasPointsReward && !isArticleClaimed && canClaimMore && (
              isTimerActive ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-yellow-500 to-amber-600">
                    <Clock className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-lg font-bold tabular-nums text-white">{timer}s</span>
                </div>
              ) : (
                showClaimHint && (
                  <Button
                    onClick={async () => {
                      if (!walletAddress) {
                        if (typeof window.ethereum !== 'undefined') {
                          try {
                            await window.ethereum.request({ method: 'eth_requestAccounts' });
                            toast({
                              title: 'Wallet Connected!',
                              description: 'You can now claim your points.',
                            });
                          } catch (error) {
                            toast({
                              title: 'Connection Failed',
                              description: 'Please connect your wallet.',
                              variant: 'destructive',
                            });
                          }
                        }
                      } else {
                        handlePointsClaim();
                      }
                    }}
                    disabled={pointsBusy}
                    className="h-9 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-white font-bold px-6 rounded-full shadow-lg"
                  >
                    {pointsBusy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Claiming...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Claim 10 Points
                      </>
                    )}
                  </Button>
                )
              )
            )}
            {hasPointsReward && isArticleClaimed && (
              <div className="bg-green-900/30 border-2 border-green-500/50 text-green-200 font-bold py-2 px-4 rounded-full shadow-xl flex items-center gap-2">
                <span>✅ Already claimed</span>
              </div>
            )}
            {hasPointsReward && !isArticleClaimed && !canClaimMore && (
              <div className="bg-blue-900/30 border-2 border-blue-500/50 text-blue-200 font-bold py-2 px-4 rounded-full shadow-xl flex items-center gap-2">
                <span>3/3 articles claimed today</span>
              </div>
            )}
            {!hasPointsReward && (
              <div className="text-blue-200/60 text-sm">
                Not a lucky article today
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
      
      <div className={`flex min-h-screen flex-col w-full overflow-x-hidden ${isAcademic ? 'bg-gradient-to-br from-orange-950/40 via-red-950/60 to-orange-900/50 bg-black' : 'bg-gray-950/30'}`}>

        <div className={`flex-1 ${isAcademic ? 'pt-0' : 'pt-12'}`}>
        <article className={`px-6 py-8 max-w-5xl mx-auto ${!isAcademic ? 'flex flex-col items-center' : ''}`} style={{ contentVisibility: 'auto' }}>
          {/* Article header */}
          <div className="mb-6 flex items-center gap-3">
            <Badge variant="secondary" className="text-sm">
              {isAcademic 
                ? (article as any).category || "Academic"
                : article.source?.title || "Unknown Source"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {isAcademic
                ? (article as any).readTime || ""
                : article.published_at && !isNaN(new Date(article.published_at).getTime())
                  ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
                  : ""}
            </span>
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-tight text-white">{article.title}</h1>

          {article.image && !isAcademic && (
            <div className="mb-8 overflow-hidden rounded-lg">
              <img
                src={article.image}
                alt=""
                className="h-auto w-full object-cover"
                loading="eager"
              />
            </div>
          )}

          {fullContent ? (
            <div className="w-full max-w-2xl mx-auto px-6 overflow-x-hidden">
              <div
                  className="article-content overflow-x-hidden
                  [&_h1]:text-white [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-8 [&_h1]:mt-12 [&_h1]:leading-tight
                  [&_h2]:text-white [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-12 [&_h2]:mb-6 [&_h2]:leading-tight [&_h2]:border-b [&_h2]:border-white/20 [&_h2]:pb-3
                  [&_h3]:text-white [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mt-10 [&_h3]:mb-4 [&_h3]:leading-snug
                  [&_h4]:text-gray-100 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:mt-8 [&_h4]:mb-3 [&_h4]:leading-snug
                  [&_p]:text-gray-300 [&_p]:text-base [&_p]:leading-[1.8] [&_p]:mb-6 [&_p]:font-normal
                  [&_a]:text-blue-400 [&_a]:underline [&_a]:decoration-blue-400/60 [&_a:hover]:text-blue-300 [&_a:hover]:decoration-blue-300 [&_a]:font-medium
                  [&_strong]:text-white [&_strong]:font-semibold 
                  [&_em]:text-gray-300 [&_em]:italic 
                  [&_ul]:mb-6 [&_ul]:mt-4 [&_ul]:space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:marker:text-blue-400
                  [&_ol]:mb-6 [&_ol]:mt-4 [&_ol]:space-y-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:marker:text-blue-400
                  [&_li]:text-gray-300 [&_li]:text-base [&_li]:leading-[1.8] [&_li]:mb-2
                  [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:pl-6 [&_blockquote]:my-8 [&_blockquote]:italic [&_blockquote]:text-gray-300 [&_blockquote]:bg-blue-900/20 [&_blockquote]:py-5 [&_blockquote]:rounded-r [&_blockquote]:text-base
                  [&_img]:my-8 [&_img]:rounded-lg [&_img]:max-w-full [&_img]:h-auto [&_img]:shadow-lg
                  [&_pre]:overflow-x-auto [&_code]:break-words"
                  dangerouslySetInnerHTML={{ __html: cleanContent(fullContent) }}
                />
            </div>
          ) : (
            <div className="w-full flex justify-center px-8 md:px-16 lg:px-32 xl:px-48">
              <div className="w-full max-w-[650px]">
              <div className="space-y-4">
                <p className="text-lg leading-relaxed text-muted-foreground">
                  {article.description}
                </p>
                {!isPaywalled && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading full article...</span>
                  </div>
                )}
                {isPaywalled && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                      🔒 This article requires a subscription
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      This content is behind a paywall. You can read it on the original site if you have an account.
                    </p>
                    <a
                      href={article.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-sm font-medium text-yellow-800 dark:text-yellow-200 underline hover:no-underline"
                    >
                      Read on CoinDesk →
                    </a>
                  </div>
                )}
              </div>

                {pointsResult && (
                  <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                    <p className="text-sm text-blue-800 dark:text-blue-200">{pointsResult}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </article>
      </div>
    </div>
    </>
  );
}
