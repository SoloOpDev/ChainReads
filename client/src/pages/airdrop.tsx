import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Eye, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TelegramPost {
  messageId: number;
  channel: string;
  text: string;
  date: string;
  image: string | null;
  views: number;
}

export default function Airdrop() {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [showClaimButton, setShowClaimButton] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Use ref to track claim status to avoid stale closure bug
  const claimStatusRef = useRef<boolean>(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasScrolledRef = useRef<boolean>(false);

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
      if (!walletAddress) return { claimedSections: { airdrop: false }, totalToday: 0 };
      
      // Normalize to lowercase for DB lookup
      const normalizedAddress = walletAddress.toLowerCase();
      
      const res = await fetch('/api/claim-status', {
        headers: { 'x-wallet-address': normalizedAddress }
      });
      
      if (!res.ok) return { claimedSections: { airdrop: false }, totalToday: 0 };
      return res.json();
    },
    enabled: !!walletAddress,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const alreadyClaimed = claimStatus?.claimedSections?.airdrop || false;
  
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
        
        console.log('[AIRDROP] Scroll detected, alreadyClaimed:', claimStatusRef.current);
        
        // Don't start timer if already claimed (use ref to avoid stale closure)
        if (claimStatusRef.current) {
          console.log('[AIRDROP] Already claimed, not starting timer');
          return;
        }
        
        console.log('[AIRDROP] Starting countdown from 10');
        
        // Initialize countdown
        let timeLeft = 10;
        setCountdown(timeLeft);
        
        // Start countdown
        countdownIntervalRef.current = setInterval(() => {
          timeLeft--;
          console.log('[AIRDROP] Countdown tick:', timeLeft, 'alreadyClaimed:', claimStatusRef.current);
          
          if (timeLeft <= 0) {
            console.log('[AIRDROP] Countdown finished, showing button');
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setCountdown(0);
            // Force show button - use setTimeout to ensure state update happens
            setTimeout(() => {
              if (!claimStatusRef.current) {
                console.log('[AIRDROP] Setting showClaimButton to TRUE');
                setShowClaimButton(true);
              } else {
                console.log('[AIRDROP] NOT showing button - already claimed');
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
  }, []); // Empty deps - use refs only

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
          section: 'airdrop',
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
        description: `You earned ${data.pointsEarned} points from Airdrop! Total today: ${data.totalToday} claims`,
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
    queryKey: ["/api/telegram/airdrop"],
    queryFn: async () => {
      const res = await fetch("/api/telegram/airdrop");
      if (!res.ok) throw new Error("Failed to fetch airdrop signals");
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
  });

  if (isLoading) {
    return (
      <div className="min-h-screen airdrop-bg -mt-16 pt-16">
        <div className="relative z-10">
          <div className="pt-8 pb-4" style={{ paddingLeft: '15px', paddingRight: '15px' }}>
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
              Airdrop Opportunities
            </h1>
          </div>
          <div className="grid grid-cols-5 gap-6" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
            {[...Array(10)].map((_, i) => (
              <Card key={i} className="backdrop-blur-md bg-purple-900/10 border-2 border-purple-500/50 rounded-xl p-4">
                <div className="h-48 bg-purple-800/20 animate-pulse rounded mb-4" />
                <div className="h-4 bg-purple-800/20 animate-pulse rounded mb-2" />
                <div className="h-4 bg-purple-800/20 animate-pulse rounded w-2/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen airdrop-bg -mt-16 pt-16">
      <div className="relative z-10">
        <div className="pt-8 pb-4 px-4 md:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
            Airdrop Opportunities
          </h1>
          
          {/* Claim instruction or Timer or Button or Already Claimed */}
          {alreadyClaimed ? (
            <div className="bg-purple-900/40 border-2 border-purple-400/60 text-purple-100 font-bold py-2 md:py-3 px-4 md:px-6 rounded-full shadow-xl flex items-center gap-2 text-sm md:text-base whitespace-nowrap">
              <span>✅ Already claimed today!</span>
            </div>
          ) : !hasScrolled ? (
            <div className="bg-purple-900/30 border-2 border-purple-500/50 text-purple-200 font-bold py-2 md:py-3 px-4 md:px-6 rounded-full shadow-xl flex items-center gap-2 text-sm md:text-base whitespace-nowrap">
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
                  className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-bold py-3 px-6 rounded-full shadow-xl border-2 border-purple-400/50 flex-shrink-0"
                >
                  <Gift className="h-5 w-5 mr-2" />
                  {claimMutation.isPending ? 'Claiming...' : 'Claim 35 Points!'}
                </Button>
              ) : (
                <div className="bg-purple-900/30 border-2 border-purple-500/50 text-purple-200 font-bold py-2 md:py-3 px-4 md:px-6 rounded-full shadow-xl flex items-center gap-2 text-sm md:text-base whitespace-nowrap">
                  <div className="w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                  <span>Claim available in {countdown}s...</span>
                </div>
              )}
        </div>

        <div className="grid grid-cols-5 gap-6 pb-6" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
          {posts?.map((post) => (
            <Card
              key={`${post.channel}-${post.messageId}`}
              className="flex flex-col h-[380px] overflow-hidden transition-all duration-300 backdrop-blur-md bg-purple-900/10 border-2 border-purple-500/50 hover:border-purple-400/70 rounded-xl hover:-translate-y-2 shadow-[0_8px_16px_rgba(0,0,0,0.4),0_4px_8px_rgba(139,92,246,0.2)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.6),0_8px_16px_rgba(139,92,246,0.4)]"
            >
              {post.image && (
                <div className="w-full h-48 flex-shrink-0 overflow-hidden">
                  <img
                    src={post.image}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="flex-1 p-4 flex flex-col overflow-hidden group">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="secondary" className="bg-purple-500/20 text-purple-200 border-purple-400/30 text-xs">
                    {post.channel}
                  </Badge>
                  <span className="text-xs text-purple-300">
                    {formatDistanceToNow(new Date(post.date), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto mb-2 scrollbar-thin scrollbar-thumb-purple-500/50 scrollbar-track-purple-900/20">
                  <p className="text-sm text-purple-100 group-hover:line-clamp-none line-clamp-3 transition-all">
                    {post.text}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-purple-400 mt-auto">
                  <Eye className="h-3 w-3" />
                  <span>{post.views?.toLocaleString() || 0} views</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
