import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, Clock, Coins, Trophy, CheckCircle2, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Countdown timer hook
function useCountdown(targetDate: Date | string) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const target = new Date(targetDate).getTime();
      const now = new Date().getTime();
      const difference = target - now;

      if (difference <= 0) {
        return 'Settling...';
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    };

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

// Bet card component to properly use hooks
function BetCard({ bet }: { bet: Bet }) {
  const priceChange = bet.exitPrice ? ((bet.exitPrice - bet.entryPrice) / bet.entryPrice) * 100 : 0;
  const countdown = useCountdown(bet.settlementDate);

  return (
    <Card className="bg-purple-900/20 border border-purple-700/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            {bet.status === "pending" && <Clock className="h-10 w-10 text-yellow-300 animate-pulse" />}
            {bet.status === "won" && <CheckCircle2 className="h-10 w-10 text-green-300" />}
            {bet.status === "lost" && <XCircle className="h-10 w-10 text-red-300" />}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-bold text-lg">{bet.symbol}</span>
              <Badge
                className={
                  bet.direction === "up"
                    ? "bg-green-500/30 text-green-200 border-2 border-green-400/50 font-bold"
                    : "bg-red-500/30 text-red-200 border-2 border-red-400/50 font-bold"
                }
              >
                {bet.direction === "up" ? "↑ LONG" : "↓ SHORT"}
              </Badge>
              <Badge variant="outline" className="text-white border-2 border-white/30 font-bold bg-white/10">
                {bet.days}d • {bet.multiplier}x
              </Badge>
            </div>
            <div className="text-sm text-white/60">
              Entry: ${bet.entryPrice.toLocaleString()}
              {bet.exitPrice && ` → Exit: $${bet.exitPrice.toLocaleString()}`}
              {bet.exitPrice && (
                <span className={priceChange >= 0 ? "text-green-400 ml-2" : "text-red-400 ml-2"}>
                  ({priceChange >= 0 ? "+" : ""}
                  {priceChange.toFixed(2)}%)
                </span>
              )}
            </div>
            <div className="text-sm text-white/90 mt-1 font-semibold flex items-center gap-2">
              {bet.status === "pending" ? (
                <>
                  <Clock className="h-4 w-4 text-yellow-400" />
                  <span className="text-yellow-400 font-bold">{countdown}</span>
                  <span className="text-white/60">remaining</span>
                </>
              ) : (
                `✓ Settled ${formatDistanceToNow(new Date(bet.settlementDate), { addSuffix: true })}`
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-white/80 mb-1">Bet Amount</div>
          <div className="text-lg font-bold text-white mb-2">{bet.betAmount.toLocaleString()} pts</div>
          {bet.status === "pending" && (
            <div className="bg-yellow-500/20 border-2 border-yellow-400/40 rounded-lg px-3 py-2">
              <div className="text-xs text-yellow-200 font-bold">Potential Win</div>
              <div className="text-yellow-300 font-black text-lg">
                {(bet.betAmount * bet.multiplier).toLocaleString()} pts
              </div>
            </div>
          )}
          {bet.status === "won" && (
            <div>
              <div className="text-xs text-green-400">You Won!</div>
              <div className="text-green-400 font-bold text-xl">+{bet.payout?.toLocaleString()} pts</div>
            </div>
          )}
          {bet.status === "lost" && (
            <div>
              <div className="text-xs text-red-400">You Lost</div>
              <div className="text-red-400 font-bold">-{bet.betAmount.toLocaleString()} pts</div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

interface Prediction {
  id: string;
  coin: string;
  symbol: string;
  currentPrice: number;
  days: number;
  multiplier: number;
}

interface Bet {
  id: string;
  symbol: string;
  direction: "up" | "down";
  betAmount: number;
  entryPrice: number;
  exitPrice: number | null;
  days: number;
  multiplier: number;
  status: "pending" | "won" | "lost";
  settlementDate: string;
  payout: number | null;
}

export default function Predictions() {
  const [selectedPred, setSelectedPred] = useState<{ pred: Prediction; direction: "up" | "down" } | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get wallet address from MetaMask - check current connection
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  useEffect(() => {
    const getAddress = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          // Use eth_requestAccounts to get current account (works even if already connected)
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            console.log('💼 Predictions - Wallet found:', accounts[0]);
            setWalletAddress(accounts[0]);
          } else {
            console.log('❌ Predictions - No wallet connected');
            setWalletAddress(null);
          }
        } catch (error) {
          console.error('Error getting wallet address:', error);
        }
      }
    };
    getAddress();
    
    // Listen for account changes
    if (typeof window.ethereum !== 'undefined') {
      const handleAccountsChanged = (accounts: string[]) => {
        console.log('🔄 Predictions - Accounts changed:', accounts);
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
        } else {
          setWalletAddress(null);
        }
      };
      
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      
      return () => {
        if (window.ethereum && window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["/api/wallet/profile", walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('No wallet');
      console.log('🔍 Fetching profile for wallet:', walletAddress);
      const res = await fetch(`/api/wallet/profile?wallet=${walletAddress}`);
      if (!res.ok) throw new Error("Failed to fetch profile");
      const data = await res.json();
      console.log('✅ Profile data received:', data);
      return data;
    },
    enabled: !!walletAddress,
    retry: 2,
    staleTime: 10000,
  });

  const { data: myBets, isLoading: betsLoading } = useQuery<Bet[]>({
    queryKey: ["/api/predictions/my-bets", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      
      // Normalize to lowercase
      const normalizedAddress = walletAddress.toLowerCase();
      
      const res = await fetch(`/api/predictions/my-bets?wallet=${normalizedAddress}`, { 
        credentials: "include",
        headers: {
          'x-wallet-address': normalizedAddress
        }
      });
      if (!res.ok) {
        if (res.status === 429) return [];
        throw new Error("Failed to fetch bets");
      }
      return res.json();
    },
    enabled: !!walletAddress,
  });

  const { data: prices, isLoading: pricesLoading } = useQuery({
    queryKey: ["/api/crypto-prices"],
    queryFn: async () => {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd");
      if (!res.ok) throw new Error("Failed to fetch prices");
      const data = await res.json();
      return {
        btc: data.bitcoin.usd,
        eth: data.ethereum.usd,
      };
    },
    refetchInterval: 5000,
    retry: 3,
    retryDelay: 1000,
    placeholderData: { btc: 0, eth: 0 }, // Show 0 while loading instead of undefined
  });

  const predictions: Prediction[] = [
    { id: "btc-3d", coin: "Bitcoin", symbol: "BTC", currentPrice: prices?.btc || 0, days: 3, multiplier: 2 },
    { id: "btc-5d", coin: "Bitcoin", symbol: "BTC", currentPrice: prices?.btc || 0, days: 5, multiplier: 3 },
    { id: "btc-7d", coin: "Bitcoin", symbol: "BTC", currentPrice: prices?.btc || 0, days: 7, multiplier: 4 },
    { id: "eth-3d", coin: "Ethereum", symbol: "ETH", currentPrice: prices?.eth || 0, days: 3, multiplier: 2 },
    { id: "eth-5d", coin: "Ethereum", symbol: "ETH", currentPrice: prices?.eth || 0, days: 5, multiplier: 3 },
    { id: "eth-7d", coin: "Ethereum", symbol: "ETH", currentPrice: prices?.eth || 0, days: 7, multiplier: 4 },
  ];

  const placeBetMutation = useMutation({
    mutationFn: async (data: { predictionId: string; direction: "up" | "down"; amount: number }) => {
      if (!walletAddress) {
        throw new Error("Wallet not connected");
      }
      
      // Normalize to lowercase
      const normalizedAddress = walletAddress.toLowerCase();
      
      const res = await fetch("/api/predictions/bet", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-wallet-address": normalizedAddress,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to place bet");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/my-bets"] });
      toast({ title: "Bet Placed!", description: "Your prediction has been recorded. Good luck!" });
      setSelectedPred(null);
      setBetAmount("");
    },
    onError: (error: Error) => {
      toast({ title: "Bet Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleBet = async (pred: Prediction, direction: "up" | "down") => {
    console.log('🎯 handleBet called');
    
    // Check if MetaMask is available
    if (typeof window.ethereum === 'undefined') {
      console.error('❌ No ethereum provider');
      toast({ 
        title: "No Wallet Found", 
        description: "Please install MetaMask to place bets", 
        variant: "destructive" 
      });
      return;
    }

    console.log('✅ Ethereum provider found');

    // Request accounts - triggers MetaMask popup if locked
    try {
      console.log('🔐 Requesting accounts (will trigger popup if locked)...');
      
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      console.log('📝 Accounts received:', accounts);
      
      if (!accounts || accounts.length === 0) {
        console.error('❌ No accounts returned');
        toast({ 
          title: "No Accounts", 
          description: "Please connect your wallet in MetaMask", 
          variant: "destructive" 
        });
        return;
      }

      const currentWallet = accounts[0];
      console.log('💼 Using wallet:', currentWallet);

      // Update wallet address if it changed
      if (currentWallet !== walletAddress) {
        console.log('🔄 Updating wallet address from', walletAddress, 'to', currentWallet);
        setWalletAddress(currentWallet);
      }

      // Fetch profile for this wallet
      console.log('🔍 Fetching profile for:', currentWallet);
      const profileRes = await fetch(`/api/wallet/profile?wallet=${currentWallet}`);
      
      if (!profileRes.ok) {
        const error = await profileRes.json().catch(() => ({ message: 'Unknown error' }));
        console.error('❌ Profile fetch failed:', error);
        throw new Error(error.message || 'Failed to fetch profile');
      }
      
      const profileData = await profileRes.json();
      console.log('✅ Profile loaded:', profileData);

      // Now open the bet dialog
      console.log('✅ Opening bet dialog');
      setSelectedPred({ pred, direction });
      
    } catch (error: any) {
      console.error('❌ Error in handleBet:', error);
      
      if (error.code === 4001) {
        toast({ 
          title: "Connection Rejected", 
          description: "You rejected the connection request", 
          variant: "destructive" 
        });
      } else if (error.code === -32002) {
        toast({ 
          title: "Request Pending", 
          description: "Please check MetaMask - a connection request is already pending", 
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Connection Failed", 
          description: error.message || "Failed to connect wallet", 
          variant: "destructive" 
        });
      }
    }
  };

  const confirmBet = () => {
    if (!selectedPred || !betAmount) return;
    const amount = parseInt(betAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid bet amount", variant: "destructive" });
      return;
    }
    if (amount > (profile?.tokenBalance || 0)) {
      toast({ title: "Insufficient Points", description: "You don't have enough points for this bet", variant: "destructive" });
      return;
    }
    if (amount % 2 !== 0) {
      toast({ title: "Invalid Amount", description: "Bet amount must be an even number", variant: "destructive" });
      return;
    }
    placeBetMutation.mutate({
      predictionId: selectedPred.pred.id,
      direction: selectedPred.direction,
      amount,
    });
  };

  return (
    <div className="min-h-screen py-8 px-8">
      <div className="pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Trophy className="h-7 w-7 text-yellow-400" />
            <h2 className="text-2xl font-bold text-white">Predictions</h2>
            <Badge variant="secondary" className="bg-yellow-400/20 text-yellow-300 border-yellow-400/30">
              Bet with Points
            </Badge>
          </div>
          <div className="flex items-center gap-2 bg-purple-900/30 backdrop-blur-md rounded-full px-4 py-2 border border-purple-700/30">
            <Coins className="h-5 w-5 text-yellow-400" />
            <span className="text-white font-bold">{profile?.tokenBalance || 0} Points</span>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-yellow-400/30 to-transparent" />
        <p className="text-purple-300 text-xs mt-2">
          Predict if the price will move ±5% in the given timeframe. Longer predictions = higher rewards!
        </p>
      </div>

      {/* Bitcoin Predictions */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-yellow-400">₿</span> Bitcoin Predictions
          </h3>
          <span className="text-xs text-purple-300 bg-purple-900/30 px-3 py-1 rounded-full border border-purple-500/30">
            🔄 Prices update every 5s
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {predictions
            .filter((p) => p.symbol === "BTC")
            .map((pred) => (
              <Card
                key={pred.id}
                className="relative group backdrop-blur-xl bg-purple-900/20 border-2 border-yellow-500/30 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-yellow-500/30 hover:border-yellow-400/60"
              >
                <div className="absolute top-2 right-2 z-10">
                  <div className="relative bg-gradient-to-br from-yellow-500 to-yellow-600 backdrop-blur-sm border border-yellow-400/60 rounded-full px-2.5 py-1 shadow-lg">
                    <span className="text-white font-black text-base">{pred.multiplier}x</span>
                  </div>
                </div>
                <div className="relative p-3">
                  <div className="inline-flex items-center gap-1.5 bg-yellow-500/30 backdrop-blur-sm border-2 border-yellow-400/60 rounded-full px-3 py-1.5 mb-2">
                    <Clock className="h-4 w-4 text-yellow-200" />
                    <span className="text-sm font-black text-white">{pred.days} Days</span>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-yellow-200/70 font-medium mb-0.5">Current Price</div>
                    <div className="text-2xl font-black text-white mb-0.5">${pred.currentPrice.toLocaleString()}</div>
                    <div className="text-xs text-yellow-300 font-semibold">Target: ±5% movement</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="h-11 bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-400/60 text-white font-bold"
                      onClick={() => handleBet(pred, "up")}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="text-xs">UP 5%+</span>
                      </div>
                    </Button>
                    <Button
                      className="h-11 bg-gradient-to-br from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 border border-rose-400/60 text-white font-bold"
                      onClick={() => handleBet(pred, "down")}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <TrendingDown className="h-3.5 w-3.5" />
                        <span className="text-xs">DOWN 5%+</span>
                      </div>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      </div>

      {/* Ethereum Predictions */}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
          <span className="text-cyan-400">Ξ</span> Ethereum Predictions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {predictions
            .filter((p) => p.symbol === "ETH")
            .map((pred) => (
              <Card
                key={pred.id}
                className="relative group backdrop-blur-xl bg-purple-900/20 border-2 border-cyan-500/30 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/30 hover:border-cyan-400/60"
              >
                <div className="absolute top-2 right-2 z-10">
                  <div className="relative bg-gradient-to-br from-cyan-500 to-cyan-600 backdrop-blur-sm border border-cyan-400/60 rounded-full px-2.5 py-1 shadow-lg">
                    <span className="text-white font-black text-base">{pred.multiplier}x</span>
                  </div>
                </div>
                <div className="relative p-3">
                  <div className="inline-flex items-center gap-1.5 bg-cyan-500/30 backdrop-blur-sm border-2 border-cyan-400/60 rounded-full px-3 py-1.5 mb-2">
                    <Clock className="h-4 w-4 text-cyan-200" />
                    <span className="text-sm font-black text-white">{pred.days} Days</span>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-cyan-200/70 font-medium mb-0.5">Current Price</div>
                    <div className="text-2xl font-black text-white mb-0.5">${pred.currentPrice.toLocaleString()}</div>
                    <div className="text-xs text-cyan-300 font-semibold">Target: ±5% movement</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="h-11 bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-400/60 text-white font-bold"
                      onClick={() => handleBet(pred, "up")}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="text-xs">UP 5%+</span>
                      </div>
                    </Button>
                    <Button
                      className="h-11 bg-gradient-to-br from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 border border-rose-400/60 text-white font-bold"
                      onClick={() => handleBet(pred, "down")}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <TrendingDown className="h-3.5 w-3.5" />
                        <span className="text-xs">DOWN 5%+</span>
                      </div>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      </div>

      {/* My Recent Bets - Always Show */}
      <div className="mt-12">
        <div className="h-px bg-gradient-to-r from-transparent via-yellow-400/20 to-transparent mb-6" />
        <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
          <Trophy className="h-7 w-7 text-yellow-400" />
          My Active Predictions
          {myBets && myBets.length > 0 && (
            <span className="text-sm text-white/50 font-normal">({myBets.length} active)</span>
          )}
        </h3>
        
        {!myBets || myBets.length === 0 ? (
          <Card className="bg-purple-900/20 border border-purple-700/30 p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <Trophy className="h-16 w-16 text-purple-400/50 mb-4" />
              <p className="text-white/60 text-lg mb-2">No active predictions yet</p>
              <p className="text-white/40 text-sm">Place your first bet above to start tracking your predictions!</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {myBets.map((bet) => (
              <BetCard key={bet.id} bet={bet} />
            ))}
          </div>
        )}
      </div>

      {/* Bet Dialog */}
      <Dialog open={!!selectedPred} onOpenChange={() => setSelectedPred(null)}>
        <DialogContent className="bg-purple-900/90 backdrop-blur-md border border-purple-700/30 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Place Your Bet</DialogTitle>
          </DialogHeader>
          {selectedPred && (
            <div className="space-y-4">
              <div className="bg-purple-800/30 rounded-xl p-4 border border-purple-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/80 text-sm">Market</span>
                  <span className="text-white font-bold">
                    {selectedPred.pred.symbol} - {selectedPred.pred.days} Days
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/80 text-sm">Direction</span>
                  <Badge className={selectedPred.direction === "up" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}>
                    {selectedPred.direction === "up" ? "↑ UP 5%+" : "↓ DOWN 5%+"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/80 text-sm">Potential Win</span>
                  <span className="text-yellow-400 font-bold">
                    {betAmount ? (parseInt(betAmount) * selectedPred.pred.multiplier).toLocaleString() : "0"} Points
                  </span>
                </div>
              </div>
              <div>
                <label className="text-white text-sm mb-2 block">Bet Amount (must be even number)</label>
                <div className="flex gap-2 mb-3">
                  <Button
                    type="button"
                    onClick={() => {
                      const amount = Math.floor((profile?.tokenBalance || 0) * 0.05);
                      setBetAmount((amount % 2 === 0 ? amount : amount - 1).toString());
                    }}
                    className="flex-1 bg-purple-800/50 hover:bg-purple-700/50 text-white text-xs h-8"
                  >
                    5%
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const amount = Math.floor((profile?.tokenBalance || 0) * 0.08);
                      setBetAmount((amount % 2 === 0 ? amount : amount - 1).toString());
                    }}
                    className="flex-1 bg-purple-800/50 hover:bg-purple-700/50 text-white text-xs h-8"
                  >
                    8%
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const amount = Math.floor((profile?.tokenBalance || 0) * 0.12);
                      setBetAmount((amount % 2 === 0 ? amount : amount - 1).toString());
                    }}
                    className="flex-1 bg-purple-800/50 hover:bg-purple-700/50 text-white text-xs h-8"
                  >
                    12%
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const amount = profile?.tokenBalance || 0;
                      setBetAmount((amount % 2 === 0 ? amount : amount - 1).toString());
                    }}
                    className="flex-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs h-8 font-bold"
                  >
                    MAX
                  </Button>
                </div>
                <Input
                  type="number"
                  step="2"
                  placeholder="Enter even number of points"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  className="bg-purple-800/30 border-purple-700/30 text-white placeholder:text-white/50"
                />
                <p className="text-white/70 text-xs mt-1">Available: {profile?.tokenBalance || 0} points</p>
              </div>
              <Button
                onClick={confirmBet}
                disabled={placeBetMutation.isPending || !betAmount || parseInt(betAmount) <= 0}
                className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-bold disabled:opacity-50"
              >
                {placeBetMutation.isPending ? "Placing Bet..." : !betAmount || parseInt(betAmount) <= 0 ? "Enter Bet Amount" : "Confirm Bet"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
