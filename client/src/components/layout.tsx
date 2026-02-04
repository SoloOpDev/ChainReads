import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Gift, Star, Info, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import { ConvertModal } from "@/components/convert-modal";
import { WelcomeModal } from "@/components/welcome-modal";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null); // Start with null, NO localStorage
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const prices = useCryptoPrices();
  const queryClient = useQueryClient();
  
  // Refs for dynamic tab measurement
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tabMetrics, setTabMetrics] = useState({ width: 0, left: 0 });

  // Prefetch data on hover
  const prefetchData = (path: string) => {
    if (path === '/trading') {
      queryClient.prefetchQuery({
        queryKey: ["/api/telegram/trading"],
        queryFn: async () => {
          const res = await fetch("/api/telegram/trading");
          if (!res.ok) return [];
          const data = await res.json();
          const postsArray = Array.isArray(data) ? data : (data.posts || []);
          return postsArray.slice(0, 30);
        },
        staleTime: 5 * 60 * 1000,
      });
    } else if (path === '/airdrop') {
      queryClient.prefetchQuery({
        queryKey: ["/api/telegram/airdrop"],
        queryFn: async () => {
          const res = await fetch("/api/telegram/airdrop");
          if (!res.ok) return [];
          const data = await res.json();
          const postsArray = Array.isArray(data) ? data : (data.posts || []);
          return postsArray.slice(0, 30);
        },
        staleTime: 5 * 60 * 1000,
      });
    } else if (path === '/academic') {
      queryClient.prefetchQuery({
        queryKey: ["/api/academic"],
        queryFn: async () => {
          const res = await fetch("/api/academic");
          if (!res.ok) return { articles: [] };
          return await res.json();
        },
        staleTime: 10 * 60 * 1000,
      });
    } else if (path === '/') {
      queryClient.prefetchQuery({
        queryKey: ["/api/news"],
        queryFn: async () => {
          const res = await fetch("/api/news");
          if (!res.ok) return { results: [] };
          return await res.json();
        },
        staleTime: 5 * 60 * 1000,
      });
    }
  };

  // Check if we're on an article page
  const isArticlePage = location.startsWith('/article/');

  // Navigation tabs configuration
  const tabs = [
    { path: "/", label: "News" },
    { path: "/airdrop", label: "Airdrop" },
    { path: "/trading", label: "Trading" },
    { path: "/academic", label: "Academic" },
    { path: "/predictions", label: "Predictions" },
  ];

  // Calculate active tab index
  const activeTabIndex = tabs.findIndex(tab => tab.path === location);

  // Dynamically measure tab positions and widths
  useEffect(() => {
    const updateTabMetrics = () => {
      if (activeTabIndex < 0 || !tabRefs.current[activeTabIndex]) {
        setTabMetrics({ width: 0, left: 0 });
        return;
      }

      const activeButton = tabRefs.current[activeTabIndex];
      const navContainer = activeButton?.parentElement;
      
      if (activeButton && navContainer) {
        const buttonRect = activeButton.getBoundingClientRect();
        const containerRect = navContainer.getBoundingClientRect();
        
        // Calculate position relative to the nav container's content area
        // The container has p-1 (4px padding), so we need to account for that
        const relativeLeft = buttonRect.left - containerRect.left;
        
        setTabMetrics({
          width: buttonRect.width,
          left: relativeLeft,
        });
      }
    };

    // Update on mount and when active tab changes
    updateTabMetrics();
    
    // Update on window resize
    window.addEventListener('resize', updateTabMetrics);
    
    // Small delay to ensure DOM is fully rendered
    const timeout = setTimeout(updateTabMetrics, 100);
    
    return () => {
      window.removeEventListener('resize', updateTabMetrics);
      clearTimeout(timeout);
    };
  }, [activeTabIndex]);

  // Check if wallet is already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      // Check if MetaMask has already connected accounts (without triggering popup)
      if (typeof window.ethereum !== 'undefined') {
        try {
          // Use eth_accounts (not eth_requestAccounts) to check without popup
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            console.log('💼 Layout - Found connected wallet:', accounts[0]);
            setAddress(accounts[0]);
          } else {
            console.log('❌ Layout - No connected wallet found');
            setAddress(null);
          }
        } catch (error) {
          console.error('Error checking wallet connection:', error);
          setAddress(null);
        }
      }
      
      // Clear any stale localStorage data (we use MetaMask as source of truth)
      localStorage.removeItem('walletAddress');
    };
    
    checkConnection();

    // Listen for account changes
    if (typeof window.ethereum !== 'undefined') {
      const handleAccountsChanged = (accounts: string[]) => {
        console.log('🔄 Accounts changed:', accounts);
        if (accounts.length > 0) {
          const newAddress = accounts[0];
          
          // Update state
          setAddress(newAddress);
          
          // Re-authenticate with backend
          fetch('/api/wallet/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: newAddress }),
          }).then(res => res.json()).then(data => {
            toast({
              title: "Wallet Switched! 🔄",
              description: `Now using ${newAddress.slice(0, 6)}...${newAddress.slice(-4)} with ${data.tokenBalance || 0} points`,
            });
          }).catch(() => {
            toast({
              title: "Wallet Switched",
              description: `Now using ${newAddress.slice(0, 6)}...${newAddress.slice(-4)}`,
            });
          });
        } else {
          setAddress(null);
          toast({
            title: "Wallet Disconnected",
            description: "Please reconnect your wallet",
          });
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);

      // Cleanup
      return () => {
        if (window.ethereum && window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, []); // Empty dependency array - handleAccountsChanged doesn't need address in closure

  const connectWallet = async () => {
    console.log('🔌 Connect Wallet clicked');
    console.log('🔍 window.ethereum exists?', typeof window.ethereum !== 'undefined');
    
    if (typeof window.ethereum === 'undefined') {
      console.error('❌ No ethereum provider found');
      toast({
        title: "No Wallet Found",
        description: "Please install MetaMask or another Web3 wallet",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    try {
      console.log('🔌 Requesting wallet connection...');
      
      // Simple direct request
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      console.log('📝 Accounts received:', accounts);
      
      if (accounts && accounts.length > 0) {
        const walletAddress = accounts[0];
        console.log('💼 Wallet address:', walletAddress);

        // Authenticate with backend
        console.log('🔐 Authenticating with backend...');
        const response = await fetch('/api/wallet/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: walletAddress }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('❌ Backend auth failed:', errorData);
          throw new Error(errorData.message || 'Failed to authenticate wallet');
        }

        const data = await response.json();
        console.log('✅ Backend auth success:', data);
        
        // Save to state ONLY (no localStorage to prevent caching wrong wallet)
        setAddress(walletAddress);
        
        // Force a re-render by updating a dummy state
        setIsConnecting(false);
        
        // Small delay to ensure state updates
        setTimeout(() => {
          toast({
            title: "Wallet Connected! 🎉",
            description: `Connected with ${data.tokenBalance || 0} points`,
          });
        }, 100);
      }
    } catch (error: any) {
      console.error('❌ Wallet connection error:', error);
      
      // Handle specific error cases
      let errorMessage = error.message || "Failed to connect wallet";
      
      if (error.code === 4001) {
        errorMessage = "Connection request rejected. Please try again.";
      } else if (error.code === -32002) {
        errorMessage = "Connection request already pending. Please check MetaMask.";
      }
      
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      // Clear local state
      setAddress(null);
      
      // Clear backend session
      await fetch('/api/wallet/disconnect', { method: 'POST' });
      
      toast({
        title: "Wallet Disconnected",
        description: "Your wallet has been disconnected. Please disconnect from MetaMask too.",
      });
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

  type UserProfile = {
    id: string;
    username: string;
    tokenBalance: number;
  };

  const { data: profile, error: profileError } = useQuery<UserProfile>({
    queryKey: ["/api/wallet/profile", address],
    queryFn: async () => {
      if (!address) {
        console.log('❌ No address for profile query');
        return null;
      }
      console.log('🔍 Fetching profile for:', address);
      const res = await fetch(`/api/wallet/profile?wallet=${address}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unknown error' }));
        console.error('❌ Profile fetch failed:', error);
        return null;
      }
      const data = await res.json();
      console.log('✅ Profile fetched:', data);
      return data;
    },
    enabled: !!address && address.length > 0,
    staleTime: 30000,
    retry: false,
  });

  return (
    <>
      {/* Welcome Modal - Shows on first visit */}
      <WelcomeModal />
      
      {/* Full Width Navigation Bar with Rounded Corners */}
      {!isArticlePage && (
        <header className="fixed top-0 left-0 right-0 z-[9999] w-full px-4 sm:px-8" style={{ margin: 0 }}>
          <div className="max-w-[96%] mx-auto bg-white/10 backdrop-blur-xl rounded-3xl border border-white/30 shadow-2xl">
            {/* Mobile Layout - Stacked */}
            <div className="md:hidden w-full flex flex-col gap-2 p-2">
              {/* Top Row: Logo + Wallet */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  className="p-0 h-auto text-sm font-black hover:bg-transparent text-purple-400 hover:text-purple-300 transition-all duration-300 hover:scale-105"
                  onClick={() => setLocation("/")}
                >
                  ChainReads$
                </Button>
                
                <div className="flex items-center gap-2" key={address || 'no-wallet-mobile'}>
                  {address ? (
                    <div className="relative group">
                      <button className="px-2 py-1 bg-white/5 rounded-full border-2 border-white/30 hover:bg-white/10 transition-colors text-xs">
                        <span className="text-white font-mono font-bold">
                          {address.slice(0, 4)}...{address.slice(-3)}
                        </span>
                      </button>
                      <div className="absolute right-0 top-full mt-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                        <div className="bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
                          <div className="px-4 py-3 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-white/10">
                            <div className="text-cyan-400 text-xl font-bold">
                              {(profile?.tokenBalance || 0).toLocaleString()} Points
                            </div>
                            <div className="text-white/60 text-xs font-mono mt-1">
                              {address.slice(0, 6)}...{address.slice(-4)}
                            </div>
                          </div>
                          <button onClick={() => setIsConvertModalOpen(true)} className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium border-b border-white/5">
                            <Gift className="w-5 h-5" />
                            <span>Convert Rewards</span>
                          </button>
                          <button onClick={() => setLocation("/my-points")} className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium border-b border-white/5">
                            <Star className="w-5 h-5" />
                            <span>My Points</span>
                          </button>
                          <button onClick={() => toast({ title: "Info & Rules", description: "Earn points by reading articles!" })} className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium border-b border-white/5">
                            <Info className="w-5 h-5" />
                            <span>Info & Rules</span>
                          </button>
                          <button onClick={disconnectWallet} className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3 text-sm font-medium">
                            <LogOut className="w-5 h-5" />
                            <span>Disconnect</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={connectWallet} disabled={isConnecting} className="h-7 text-xs bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-bold px-3 rounded-full transition-colors border border-white/20">
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Bottom Row: Tabs + Prices */}
              <div className="flex items-center justify-between gap-2">
                <nav className="relative flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20 overflow-x-auto scrollbar-hide">
                  {activeTabIndex >= 0 && (
                    <div className="absolute inset-y-1 bg-white/20 backdrop-blur-lg rounded-full shadow-lg border border-white/30 transition-all duration-300 ease-out" style={{ width: `${tabMetrics.width}px`, left: `${tabMetrics.left}px` }} />
                  )}
                  {tabs.map((tab, index) => (
                    <button key={tab.path} ref={(el) => (tabRefs.current[index] = el)} onClick={() => setLocation(tab.path)} onMouseEnter={() => prefetchData(tab.path)} className="px-2 h-6 text-white text-[10px] font-semibold transition-all duration-200 rounded-full hover:bg-white/5 relative z-10 flex items-center justify-center leading-none whitespace-nowrap">
                      {tab.label}
                    </button>
                  ))}
                </nav>
                
                <div className="flex items-center gap-1 text-[9px] font-bold bg-black/40 backdrop-blur-md rounded-full px-2 py-1 border border-white/20 whitespace-nowrap shadow-lg">
                  <span style={{ color: '#FFD700', fontWeight: '900' }}>
                    ${prices.btc ? Math.round(prices.btc / 1000) : '...'}k
                  </span>
                  <span className="flex flex-col gap-0.5 text-white/50" style={{ fontSize: '4px' }}>
                    <span>•</span>
                    <span>•</span>
                    <span>•</span>
                  </span>
                  <span style={{ color: '#00E5FF', fontWeight: '900' }}>
                    ${prices.eth ? Math.round(prices.eth) : '...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Desktop Layout - Original */}
            <div className="hidden md:grid w-full grid-cols-[1fr_auto_1fr] h-14 items-center px-2 lg:px-4 relative gap-4">
            {/* Logo */}
            <Button
              variant="ghost"
              className="p-0 h-auto text-sm sm:text-base lg:text-lg font-black hover:bg-transparent text-purple-400 hover:text-purple-300 transition-all duration-300 hover:scale-105 justify-self-start"
              onClick={() => setLocation("/")}
            >
              ChainReads$
            </Button>

            {/* Center - Compact Pill Tabs with Dynamic Indicator */}
            <nav className="relative flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full p-1.5 border border-white/20">
              {/* Sliding tab indicator - Dynamically positioned */}
              {activeTabIndex >= 0 && (
                <div
                  className="absolute inset-y-1.5 bg-white/20 backdrop-blur-lg rounded-full shadow-lg border border-white/30 transition-all duration-300 ease-out"
                  style={{
                    width: `${tabMetrics.width}px`,
                    left: `${tabMetrics.left}px`,
                  }}
                />
              )}

              {tabs.map((tab, index) => (
                <button
                  key={tab.path}
                  ref={(el) => (tabRefs.current[index] = el)}
                  onClick={() => setLocation(tab.path)}
                  onMouseEnter={() => prefetchData(tab.path)}
                  className="px-4 lg:px-5 h-9 text-white hover:text-white text-sm font-semibold transition-all duration-200 rounded-full hover:bg-white/5 relative z-10 flex items-center justify-center leading-none whitespace-nowrap"
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Right - Live Prices & Connect Wallet */}
            <div className="flex items-center gap-6 justify-self-end" key={address || 'no-wallet'}>
              {/* Live Crypto Prices */}
              <div className="flex items-center gap-3 text-sm font-bold bg-black/40 backdrop-blur-md rounded-full px-5 py-2.5 border border-white/20 whitespace-nowrap shadow-lg">
                <span style={{ 
                  color: '#FFD700', 
                  textShadow: '0 0 20px rgba(255, 215, 0, 0.8), 0 0 30px rgba(255, 215, 0, 0.4)',
                  fontWeight: '900'
                }}>
                  BTC: ${prices.btc ? prices.btc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '...'}
                </span>
                <span className="text-white/50" style={{ transform: 'translateY(-2px)' }}>|</span>
                <span style={{ 
                  color: '#00E5FF', 
                  textShadow: '0 0 20px rgba(0, 229, 255, 0.8), 0 0 30px rgba(0, 229, 255, 0.4)',
                  fontWeight: '900'
                }}>
                  ETH: ${prices.eth ? prices.eth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '...'}
                </span>
              </div>

              {address ? (
                <div className="relative group">
                  {/* Wallet Button */}
                  <button className="px-3 py-1 bg-white/5 rounded-full border-2 border-white/30 hover:bg-white/10 transition-colors">
                    <span className="text-white text-xs font-mono font-bold">
                      {address.slice(0, 6)}...{address.slice(-4)}
                    </span>
                  </button>

                  {/* Dropdown Menu - Shows on HOVER */}
                  <div className="absolute right-0 top-full mt-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <div className="bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
                      {/* Balance Display */}
                      <div className="px-4 py-3 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-white/10">
                        <div className="text-cyan-400 text-2xl font-bold">
                          {(profile?.tokenBalance || 0).toLocaleString()} Points
                        </div>
                        <div className="text-white/60 text-xs font-mono mt-1">
                          {address.slice(0, 6)}...{address.slice(-4)}
                        </div>
                      </div>

                      {/* Menu Items */}
                      <button
                        onClick={() => setIsConvertModalOpen(true)}
                        className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium border-b border-white/5"
                      >
                        <Gift className="w-5 h-5" />
                        <span>Convert Rewards</span>
                      </button>

                      <button
                        onClick={() => setLocation("/my-points")}
                        className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium border-b border-white/5"
                      >
                        <Star className="w-5 h-5" />
                        <span>My Points & History</span>
                      </button>

                      <button
                        onClick={() => {
                          toast({
                            title: "Info & Rules",
                            description: "Earn points by reading articles and engaging with content!",
                          });
                        }}
                        className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm font-medium border-b border-white/5"
                      >
                        <Info className="w-5 h-5" />
                        <span>Info & Rules</span>
                      </button>

                      <button
                        onClick={disconnectWallet}
                        className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3 text-sm font-medium"
                      >
                        <LogOut className="w-5 h-5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={connectWallet}
                        disabled={isConnecting}
                        className="h-10 text-sm bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-bold px-6 rounded-full transition-colors border border-white/20"
                      >
                        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="bottom" 
                      className="bg-white/10 backdrop-blur-xl border border-white/20 text-white p-3 shadow-2xl"
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-yellow-400" />
                        <div className="text-xs">
                          <p className="text-white font-medium">We can't access your keys.</p>
                          <p className="text-cyan-300">Still, use a burner wallet for safety.</p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
          </div>
        </header>
      )}

      <div className={`min-h-screen ${
        location === '/predictions' ? 'predictions-bg' : 
        location === '/' ? 'news-bg' : 
        location === '/airdrop' ? 'airdrop-bg' :
        location === '/trading' ? 'trading-bg' :
        'liquid-glass-bg'
      } w-full`}>
        {/* Main content */}
        <main className={`flex-1 ${!isArticlePage ? 'pt-20 md:pt-16' : 'pt-0'} transition-opacity duration-300 w-full`}>
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Convert Modal */}
      <ConvertModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
      />
    </>
  );
}
