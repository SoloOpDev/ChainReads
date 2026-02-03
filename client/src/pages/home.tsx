import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Diamond, Gift, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CryptoPanicResponse } from "@shared/schema";
import { queryClient as globalQueryClient } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/api";
import { getPointsSelection } from "@/lib/points-selection";
import { getAuthHeaders } from "@/lib/auth";

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [claimedArticles, setClaimedArticles] = useState<Set<string>>(new Set());

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
        setClaimedArticles(new Set()); // Reset claims on wallet change
      };
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        if (window.ethereum?.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, []);

  // Fetch claimed articles for today
  const { data: claimedData } = useQuery({
    queryKey: ['/api/news/claimed', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return { claimed: [] };
      
      const normalizedAddress = walletAddress.toLowerCase();
      console.log('🔍 Fetching claimed articles for:', normalizedAddress);
      const res = await fetch(`/api/news/claimed?wallet=${normalizedAddress}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (!res.ok) {
        console.log('❌ Failed to fetch claimed articles:', res.status);
        return { claimed: [] };
      }
      const data = await res.json();
      console.log('✅ Claimed articles from server:', data);
      return data;
    },
    enabled: !!walletAddress,
    refetchOnMount: 'always',
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache
  });

  // Update claimed articles when data loads
  useEffect(() => {
    if (claimedData?.claimed) {
      setClaimedArticles(new Set(claimedData.claimed));
      console.log('📋 Updated claimed articles from API:', claimedData.claimed);
    }
  }, [claimedData]);

  const { data: newsData, isLoading } = useQuery<CryptoPanicResponse>({
    queryKey: ["/api/news"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/news"));
      if (!res.ok) throw new Error("Failed to fetch news");
      const data = await res.json();
      
      // Sort by published date (newest first)
      if (data.results) {
        data.results.sort((a: any, b: any) => {
          const dateA = new Date(a.published_at).getTime();
          const dateB = new Date(b.published_at).getTime();
          return dateB - dateA; // Descending order (newest first)
        });
      }
      
      return data;
    },
    refetchInterval: 2 * 60 * 1000,
    staleTime: 1 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const luckyArticles = useMemo(() => {
    return newsData?.results?.length ? getPointsSelection(newsData.results.length) : [];
  }, [newsData?.results?.length]);

  const claimMutation = useMutation({
    mutationFn: async (articleId: string) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      
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
      
      const res = await fetch('/api/news/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          articleId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to claim points');
      }

      return res.json();
    },
    onSuccess: async (data, articleId) => {
      // Invalidate and refetch immediately to get fresh data from API
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/news/claimed'] });
      
      // Wait for refetch to complete before updating UI
      await queryClient.refetchQueries({ queryKey: ['/api/news/claimed'] });
      
      const remaining = data.remaining || 0;
      toast({
        title: '🎉 Points Claimed!',
        description: remaining > 0 
          ? `You earned 10 points! Claim ${remaining} more article${remaining > 1 ? 's' : ''} for 30 total.`
          : 'You earned 10 points! All 3 articles claimed today (30 points total)!',
        duration: 5000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Claim Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleClaim = async (e: React.MouseEvent, articleId: string) => {
    e.stopPropagation();
    
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
            description: 'Please connect your wallet to claim points.',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'No Wallet Found',
          description: 'Please install MetaMask to claim points.',
          variant: 'destructive',
        });
      }
    } else {
      claimMutation.mutate(articleId);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen news-bg -mt-16 pt-16">
        <div className="relative z-10">
          <div className="pt-6 pb-4 px-4 md:px-8 border-b-2 border-blue-500/30 mb-6">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              News
            </h2>
          </div>
          <div className="grid grid-cols-5 gap-6 px-2 md:px-4">
            {[...Array(10)].map((_, i) => (
              <Card key={i} className="backdrop-blur-md bg-blue-900/10 border-2 border-blue-500/40 rounded-xl p-4">
                <div className="h-48 bg-blue-800/20 animate-pulse rounded mb-4" />
                <div className="h-4 bg-blue-800/20 animate-pulse rounded mb-2" />
                <div className="h-4 bg-blue-800/20 animate-pulse rounded w-2/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!newsData) {
    return (
      <div className="min-h-full">
        <div className="text-center py-12">
          <p className="text-muted-foreground">No news available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen news-bg -mt-16 pt-16">
      <div className="relative z-10">
        <div className="pt-6 pb-4 px-4 md:px-8 border-b-2 border-blue-500/30 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">News</h2>
            <div className="text-blue-200 text-sm font-medium">
              Claim 10 points from 3 articles ({claimedArticles.size}/3 claimed today)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-6 pb-6 px-2 md:px-4">
        {newsData.results.map((article, index) => {
          const prefetchArticle = () => {
            globalQueryClient
              .prefetchQuery({
                queryKey: ["/api/article", String(article.id)],
                queryFn: async () => {
                  const res = await fetch(getApiUrl(`/api/article/${String(article.id)}`));
                  if (!res.ok) throw new Error("Failed to prefetch article details");
                  return res.json();
                },
                staleTime: 5 * 60 * 1000,
              })
              .catch(() => {});
          };

          const isLucky = luckyArticles.includes(index);
          const isClaimed = claimedArticles.has(String(article.id));
          const canClaim = isLucky && !isClaimed && claimedArticles.size < 3;

          // Log ALL lucky articles
          if (isLucky) {
            console.log(`🎲 Lucky article #${index}:`, {
              id: article.id,
              title: article.title?.substring(0, 50),
              isLucky,
              isClaimed,
              canClaim,
              claimedSize: claimedArticles.size
            });
          }

          return (
            <Card
              key={article.id}
              role="article"
              aria-label={article.title}
              tabIndex={0}
              className={`relative group cursor-pointer backdrop-blur-md border-2 transition-all duration-300 rounded-xl hover:-translate-y-2 flex flex-col h-[380px] overflow-hidden focus:ring-2 focus:outline-none ${
                isLucky
                  ? "bg-yellow-900/10 border-yellow-400/50 hover:border-yellow-400/70 shadow-[0_8px_16px_rgba(0,0,0,0.4),0_4px_8px_rgba(250,204,21,0.3)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.6),0_8px_16px_rgba(250,204,21,0.5)] focus:ring-yellow-400"
                  : "bg-blue-900/10 border-blue-500/50 hover:border-blue-400/70 shadow-[0_8px_16px_rgba(0,0,0,0.4),0_4px_8px_rgba(59,130,246,0.2)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.6),0_8px_16px_rgba(59,130,246,0.4)] focus:ring-blue-400"
              }`}
              onMouseEnter={prefetchArticle}
              onMouseDown={prefetchArticle}
              onTouchStart={prefetchArticle}
              onClick={() => setLocation(`/article/${article.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setLocation(`/article/${article.id}`);
                }
              }}
            >
              {article.image && (
                <div className="relative w-full h-48 flex-shrink-0 overflow-hidden">
                  <img
                    src={article.image}
                    alt={article.title || "Crypto news article"}
                    className="h-full w-full object-cover"
                    loading={index < 8 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index < 4 ? "high" : "auto"}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  {isLucky && !isClaimed && (
                    <div className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600 shadow-xl border-2 border-yellow-300">
                      <Diamond className="h-6 w-6 text-white drop-shadow-lg font-bold stroke-[3]" />
                    </div>
                  )}
                  {isClaimed && (
                    <div className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 shadow-xl border-2 border-green-300">
                      <Check className="h-6 w-6 text-white drop-shadow-lg font-bold stroke-[3]" />
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col flex-1 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="bg-blue-500/20 text-blue-200 border-blue-400/30 font-medium text-xs backdrop-blur-sm">
                    {article.source && article.source.title ? article.source.title : ""}
                  </Badge>
                  <span className="text-xs text-blue-300">
                    {article.published_at && !isNaN(new Date(article.published_at).getTime())
                      ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
                      : ""}
                  </span>
                </div>
                <h3 className="text-base font-bold text-blue-100 mb-2 line-clamp-2 drop-shadow-sm">{article.title}</h3>
                <p className="text-sm text-blue-200/90 line-clamp-3 flex-1 drop-shadow-sm">{article.description}</p>
                
                {canClaim && (
                  <Button
                    onClick={(e) => handleClaim(e, String(article.id))}
                    disabled={claimMutation.isPending}
                    className="mt-3 w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-white font-bold py-2 rounded-lg shadow-lg"
                  >
                    <Gift className="h-4 w-4 mr-2" />
                    {claimMutation.isPending ? 'Claiming...' : 'Claim 10 Points'}
                  </Button>
                )}
                
                {isClaimed && (
                  <div className="mt-3 w-full bg-green-900/30 border-2 border-green-500/50 text-green-200 font-bold py-2 rounded-lg text-center text-sm">
                    ✅ Claimed
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      </div>
    </div>
  );
}
