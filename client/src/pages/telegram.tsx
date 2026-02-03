import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Eye, Gift, X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getWalletAddress } from "@/lib/wallet";

interface TelegramPost {
  messageId: number;
  channel: string;
  text: string;
  date: string;
  image: string | null;
  views: number;
}

export default function Trading() {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [showClaimButton, setShowClaimButton] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<TelegramPost | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const { toast} = useToast();
  const queryClient = useQueryClient();
  
  // Use ref to track claim status to avoid stale closure bug
  const claimStatusRef = useRef<boolean>(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasScrolledRef = useRef<boolean>(false);

  // Get wallet address (cached to prevent spamming MetaMask)
  useEffect(() => {
    const fetchAddress = async () => {
      const address = await getWalletAddress();
      setWalletAddress(address);
    };
    fetchAddress();

    if (typeof window.ethereum !== 'undefined') {
      const handleAccountsChanged = (accounts: string[]) => {
        const newAddress = accounts.length > 0 ? accounts[0] : null;
        setWalletAddress(newAddress);
        // Reset state when wallet changes
        setHasScrolled(false);
        setShowClaimButton(false);
        claimStatusRef.current = false;
      };
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        if (window.ethereum?.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, []);

  // Check claim status
  const { data: claimStatus } = useQuery({
    queryKey: ['/api/claim-status', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return { claimedSections: { trading: false }, totalToday: 0 };
      
      // Normalize to lowercase for DB lookup
      const normalizedAddress = walletAddress.toLowerCase();
      
      const res = await fetch('/api/claim-status', {
        headers: { 'x-wallet-address': normalizedAddress }
      });
      
      if (!res.ok) return { claimedSections: { trading: false }, totalToday: 0 };
      return res.json();
    },
    enabled: !!walletAddress,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const alreadyClaimed = claimStatus?.claimedSections?.trading || false;
  
  // Update ref whenever claim status changes
  useEffect(() => {
    claimStatusRef.current = alreadyClaimed;
    
    // Hide button immediately if already claimed
    if (alreadyClaimed) {
      setShowClaimButton(false);
    }
  }, [alreadyClaimed]);

  // Scroll detection - show claim button after 10 seconds of scrolling
  useEffect(() => {
    const handleScroll = () => {
      // Only trigger once when scrolling past 100px - use ref to prevent multiple triggers
      if (!hasScrolledRef.current && window.scrollY > 100) {
        hasScrolledRef.current = true; // Set ref immediately to block other scroll events
        setHasScrolled(true);
        
        console.log('[TRADING] Scroll detected, wallet:', walletAddress, 'alreadyClaimed:', claimStatusRef.current);
        
        // Don't start timer if no wallet connected
        if (!walletAddress) {
          console.log('[TRADING] No wallet connected, not starting timer');
          return;
        }
        
        // Don't start timer if already claimed (use ref to avoid stale closure)
        if (claimStatusRef.current) {
          console.log('[TRADING] Already claimed, not starting timer');
          return;
        }
        
        console.log('[TRADING] Starting countdown from 10');
        
        // Initialize countdown
        let timeLeft = 10;
        setCountdown(timeLeft);
        
        // Start countdown
        countdownIntervalRef.current = setInterval(() => {
          timeLeft--;
          console.log('[TRADING] Countdown tick:', timeLeft, 'alreadyClaimed:', claimStatusRef.current);
          
          if (timeLeft <= 0) {
            console.log('[TRADING] Countdown finished, showing button');
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setCountdown(0);
            // Force show button - use setTimeout to ensure state update happens
            setTimeout(() => {
              if (!claimStatusRef.current) {
                console.log('[TRADING] Setting showClaimButton to TRUE');
                setShowClaimButton(true);
              } else {
                console.log('[TRADING] NOT showing button - already claimed');
              }
            }, 100);
          } else {
            setCountdown(timeLeft);
          }
        }, 1000);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [walletAddress]); // Add walletAddress to deps

  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress) throw new Error('Wallet not connected');
      
      // Normalize to lowercase for DB lookup
      const normalizedAddress = walletAddress.toLowerCase();
      
      const res = await fetch('/api/claim-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': normalizedAddress,
        },
        body: JSON.stringify({
          section: 'trading',
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to claim points');
      }

      return res.json();
    },
    onSuccess: (data) => {
      // Hide button immediately
      setShowClaimButton(false);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claim-status'] });
      
      toast({
        title: '🎉 Points Claimed!',
        description: `You earned ${data.pointsEarned} points from Trading! Total today: ${data.totalToday} claims`,
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

  const { data: posts, isLoading } = useQuery<TelegramPost[]>({
    queryKey: ["/api/telegram/trading"],
    queryFn: async () => {
      const res = await fetch("/api/telegram/trading");
      if (!res.ok) throw new Error("Failed to fetch trading signals");
      const data = await res.json();
      
      // Handle new response format { posts: [], fetchedAt: "", totalPosts: 0 }
      const postsArray = Array.isArray(data) ? data : (data.posts || []);
      
      // Sort by date (newest first)
      postsArray.sort((a: TelegramPost, b: TelegramPost) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });
      
      return postsArray;
    },
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });

  // Get posts with images for navigation
  const postsWithImages = (posts || []).filter(post => post.image);

  // Filter posts by channel for tabs
  const tradingPosts = (posts || []).filter(post => 
    post.channel.toLowerCase().includes('signal') || 
    post.channel.toLowerCase().includes('trading') ||
    post.channel.toLowerCase().includes('crypto')
  );
  
  const airdropPosts = (posts || []).filter(post => 
    post.channel.toLowerCase().includes('airdrop') || 
    post.channel.toLowerCase().includes('drop')
  );
  
  const allPosts = posts || [];

  // Handle keyboard navigation for image preview
  useEffect(() => {
    if (!selectedPost) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPost(null);
        setZoom(1);
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          const prevPost = postsWithImages[currentIndex - 1];
          setSelectedPost(prevPost);
          setCurrentIndex(currentIndex - 1);
          setZoom(1);
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < postsWithImages.length - 1) {
          const nextPost = postsWithImages[currentIndex + 1];
          setSelectedPost(nextPost);
          setCurrentIndex(currentIndex + 1);
          setZoom(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPost, currentIndex, postsWithImages]);

  const openImagePreview = (post: TelegramPost) => {
    setSelectedPost(post);
    const index = postsWithImages.findIndex(p => p.messageId === post.messageId && p.channel === post.channel);
    setCurrentIndex(index);
    setZoom(1);
  };

  const navigateNext = () => {
    if (currentIndex < postsWithImages.length - 1) {
      const nextPost = postsWithImages[currentIndex + 1];
      setSelectedPost(nextPost);
      setCurrentIndex(currentIndex + 1);
      setZoom(1);
    }
  };

  const navigatePrevious = () => {
    if (currentIndex > 0) {
      const prevPost = postsWithImages[currentIndex - 1];
      setSelectedPost(prevPost);
      setCurrentIndex(currentIndex - 1);
      setZoom(1);
    }
  };

  const handleDownload = () => {
    if (selectedPost?.image) {
      const link = document.createElement('a');
      link.href = selectedPost.image;
      link.download = `trading-${selectedPost.channel}-${selectedPost.messageId}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen trading-bg -mt-16 pt-16">
        <div className="relative z-10">
          <div className="pt-6 pb-4" style={{ paddingLeft: '15px', paddingRight: '15px' }}>
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent border-b-2 border-emerald-500/30 pb-4">
              Trading Signals
            </h1>
          </div>
          <div className="grid grid-cols-5 gap-4" style={{ paddingLeft: '15px', paddingRight: '15px' }}>
            {[...Array(10)].map((_, i) => (
              <Card key={i} className="backdrop-blur-md bg-emerald-900/10 border-2 border-emerald-500/50 rounded-xl p-4">
                <div className="h-48 bg-emerald-800/20 animate-pulse rounded mb-4" />
                <div className="h-4 bg-emerald-800/20 animate-pulse rounded mb-2" />
                <div className="h-4 bg-emerald-800/20 animate-pulse rounded w-2/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen trading-bg -mt-16 pt-16">
      {/* Image Preview Popup */}
      {selectedPost && selectedPost.image && (
        <>
          {/* Backdrop - Very light transparent */}
          <div
            className="fixed inset-0 bg-black/20 z-[9999] backdrop-blur-[2px] animate-in fade-in duration-200"
            onClick={() => {
              setSelectedPost(null);
              setZoom(1);
            }}
          />
          
          {/* Preview Card - Very subtle gray */}
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-8 pointer-events-none">
            <div 
              className="relative bg-gray-800/60 backdrop-blur-md rounded-xl shadow-2xl border border-emerald-500/40 overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200"
              style={{ maxWidth: '900px', maxHeight: '85vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-emerald-500/30 bg-gray-700/25">
                <div className="flex items-center gap-3">
                  <Badge className="bg-emerald-600 text-white">
                    {selectedPost.channel}
                  </Badge>
                  <span className="text-sm text-gray-300">
                    {currentIndex + 1} / {postsWithImages.length}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Navigation */}
                  <button
                    onClick={navigatePrevious}
                    disabled={currentIndex === 0}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous (←)"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-200" />
                  </button>
                  <button
                    onClick={navigateNext}
                    disabled={currentIndex >= postsWithImages.length - 1}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next (→)"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-200" />
                  </button>
                  
                  {/* Zoom */}
                  <div className="h-6 w-px bg-gray-500 mx-1" />
                  <button
                    onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4 text-gray-200" />
                  </button>
                  <span className="text-gray-200 text-xs min-w-[45px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4 text-gray-200" />
                  </button>
                  
                  {/* Download */}
                  <div className="h-6 w-px bg-gray-500 mx-1" />
                  <button
                    onClick={handleDownload}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4 text-gray-200" />
                  </button>
                  
                  {/* Close */}
                  <button
                    onClick={() => {
                      setSelectedPost(null);
                      setZoom(1);
                    }}
                    className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors ml-2"
                    title="Close (Esc)"
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>

              {/* Image Container */}
              <div className="relative bg-gray-700/20 flex items-center justify-center" style={{ height: '500px' }}>
                <div className="overflow-auto max-h-full max-w-full flex items-center justify-center p-4">
                  <img
                    src={selectedPost.image}
                    alt={selectedPost.text}
                    className="object-contain transition-transform duration-200 select-none rounded"
                    style={{ 
                      transform: `scale(${zoom})`,
                      maxHeight: '480px',
                      maxWidth: '100%'
                    }}
                    draggable={false}
                  />
                </div>
              </div>

              {/* Footer Info */}
              <div className="p-4 border-t border-emerald-500/30 bg-gray-700/25">
                <p className="text-gray-200 text-sm leading-relaxed line-clamp-2 mb-2">
                  {selectedPost.text}
                </p>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {selectedPost.views?.toLocaleString() || 0} views
                  </span>
                  <span>
                    {formatDistanceToNow(new Date(selectedPost.date), { addSuffix: true })}
                  </span>
                  <span className="ml-auto text-gray-500">
                    Press ESC to close • Arrow keys to navigate
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="relative z-10">
        {/* Header Section with Border */}
        <div className="pt-6 pb-4 px-4 md:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b-2 border-emerald-500/30 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Trading Signals
          </h1>
          
          {/* Claim instruction or Timer or Button or Already Claimed */}
          {!walletAddress ? (
            <div className="bg-yellow-900/30 border-2 border-yellow-500/50 text-yellow-200 font-bold py-2 md:py-3 px-4 md:px-6 rounded-full shadow-xl flex items-center gap-2 text-sm md:text-base whitespace-nowrap">
              <span>🔌 Connect wallet to claim points!</span>
            </div>
          ) : alreadyClaimed ? (
            <div className="bg-green-900/30 border-2 border-green-500/50 text-green-200 font-bold py-2 md:py-3 px-4 md:px-6 rounded-full shadow-xl flex items-center gap-2 text-sm md:text-base whitespace-nowrap">
              <span>✅ Already claimed today!</span>
            </div>
          ) : !hasScrolled ? (
            <div className="bg-emerald-900/30 border-2 border-emerald-500/50 text-emerald-200 font-bold py-2 md:py-3 px-4 md:px-6 rounded-full shadow-xl flex items-center gap-2 text-sm md:text-base whitespace-nowrap">
              <span>📜 Scroll down to claim 35 points!</span>
            </div>
          ) : showClaimButton ? (
            <Button
              onClick={async () => {
                if (!walletAddress) {
                  // Prompt wallet connection
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
                  claimMutation.mutate();
                }
              }}
              disabled={claimMutation.isPending}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-6 rounded-full shadow-xl border-2 border-emerald-400/50 flex-shrink-0"
            >
              <Gift className="h-5 w-5 mr-2" />
              {claimMutation.isPending ? 'Claiming...' : 'Claim 35 Points!'}
            </Button>
          ) : (
            <div className="bg-emerald-900/30 border-2 border-emerald-500/50 text-emerald-200 font-bold py-2 md:py-3 px-4 md:px-6 rounded-full shadow-xl flex items-center gap-2 text-sm md:text-base whitespace-nowrap">
              <div className="w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
              <span>Claim available in {countdown}s...</span>
            </div>
          )}
        </div>

        <Tabs defaultValue="all" className="w-full px-4 md:px-8">
          <TabsList className="mb-6 bg-emerald-900/30 border border-emerald-700/30">
            <TabsTrigger value="all" className="data-[state=active]:bg-emerald-700/50 data-[state=active]:text-white text-emerald-300">
              All
            </TabsTrigger>
            <TabsTrigger value="trading" className="data-[state=active]:bg-emerald-700/50 data-[state=active]:text-white text-emerald-300">
              Trading
            </TabsTrigger>
            <TabsTrigger value="airdrop" className="data-[state=active]:bg-emerald-700/50 data-[state=active]:text-white text-emerald-300">
              Airdrops
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="grid grid-cols-5 gap-4 pb-6">
              {allPosts.map((post) => (
                <Card
                  key={`${post.channel}-${post.messageId}`}
                  className="flex flex-col h-[380px] overflow-hidden transition-all duration-300 backdrop-blur-md bg-emerald-900/10 border-2 border-emerald-500/40 hover:border-emerald-400/70 rounded-xl hover:-translate-y-2 shadow-[0_8px_16px_rgba(0,0,0,0.4),0_4px_8px_rgba(16,185,129,0.2)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.6),0_8px_16px_rgba(16,185,129,0.4)]"
                >
                  {post.image && (
                    <div 
                      className="w-full h-48 flex-shrink-0 overflow-hidden cursor-pointer group relative"
                      onClick={() => openImagePreview(post)}
                    >
                      <img
                        src={post.image}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 pointer-events-none"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center pointer-events-none">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center gap-2">
                          <Eye className="w-8 h-8 text-white drop-shadow-lg" />
                          <span className="text-white text-sm font-medium drop-shadow-lg">Quick View</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 p-4 flex flex-col overflow-hidden group">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 text-xs">
                        {post.channel}
                      </Badge>
                      <span className="text-xs text-emerald-300">
                        {formatDistanceToNow(new Date(post.date), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto mb-2 scrollbar-thin scrollbar-thumb-emerald-500/50 scrollbar-track-emerald-900/20">
                      <p className="text-sm text-emerald-100 group-hover:line-clamp-none line-clamp-3 transition-all">
                        {post.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-auto">
                      <Eye className="h-3 w-3" />
                      <span>{post.views?.toLocaleString() || 0} views</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="trading">
            <div className="grid grid-cols-5 gap-4 pb-6">
              {tradingPosts.map((post) => (
                <Card
                  key={`${post.channel}-${post.messageId}`}
                  className="flex flex-col h-[380px] overflow-hidden transition-all duration-300 backdrop-blur-md bg-emerald-900/10 border-2 border-emerald-500/40 hover:border-emerald-400/70 rounded-xl hover:-translate-y-2 shadow-[0_8px_16px_rgba(0,0,0,0.4),0_4px_8px_rgba(16,185,129,0.2)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.6),0_8px_16px_rgba(16,185,129,0.4)]"
                >
                  {post.image && (
                    <div 
                      className="w-full h-48 flex-shrink-0 overflow-hidden cursor-pointer group relative"
                      onClick={() => openImagePreview(post)}
                    >
                      <img
                        src={post.image}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 pointer-events-none"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center pointer-events-none">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center gap-2">
                          <Eye className="w-8 h-8 text-white drop-shadow-lg" />
                          <span className="text-white text-sm font-medium drop-shadow-lg">Quick View</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 p-4 flex flex-col overflow-hidden group">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 text-xs">
                        {post.channel}
                      </Badge>
                      <span className="text-xs text-emerald-300">
                        {formatDistanceToNow(new Date(post.date), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto mb-2 scrollbar-thin scrollbar-thumb-emerald-500/50 scrollbar-track-emerald-900/20">
                      <p className="text-sm text-emerald-100 group-hover:line-clamp-none line-clamp-3 transition-all">
                        {post.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-auto">
                      <Eye className="h-3 w-3" />
                      <span>{post.views?.toLocaleString() || 0} views</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="airdrop">
            <div className="grid grid-cols-5 gap-4 pb-6">
              {airdropPosts.map((post) => (
                <Card
                  key={`${post.channel}-${post.messageId}`}
                  className="flex flex-col h-[380px] overflow-hidden transition-all duration-300 backdrop-blur-md bg-emerald-900/10 border-2 border-emerald-500/40 hover:border-emerald-400/70 rounded-xl hover:-translate-y-2 shadow-[0_8px_16px_rgba(0,0,0,0.4),0_4px_8px_rgba(16,185,129,0.2)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.6),0_8px_16px_rgba(16,185,129,0.4)]"
                >
                  {post.image && (
                    <div 
                      className="w-full h-48 flex-shrink-0 overflow-hidden cursor-pointer group relative"
                      onClick={() => openImagePreview(post)}
                    >
                      <img
                        src={post.image}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 pointer-events-none"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center pointer-events-none">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center gap-2">
                          <Eye className="w-8 h-8 text-white drop-shadow-lg" />
                          <span className="text-white text-sm font-medium drop-shadow-lg">Quick View</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 p-4 flex flex-col overflow-hidden group">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 text-xs">
                        {post.channel}
                      </Badge>
                      <span className="text-xs text-emerald-300">
                        {formatDistanceToNow(new Date(post.date), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto mb-2 scrollbar-thin scrollbar-thumb-emerald-500/50 scrollbar-track-emerald-900/20">
                      <p className="text-sm text-emerald-100 group-hover:line-clamp-none line-clamp-3 transition-all">
                        {post.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-auto">
                      <Eye className="h-3 w-3" />
                      <span>{post.views?.toLocaleString() || 0} views</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
