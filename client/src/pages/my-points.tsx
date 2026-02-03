import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, TrendingUp, Activity, ArrowRightLeft, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

export default function MyPoints() {
  const [address, setAddress] = useState<string | null>(null);
  
  useEffect(() => {
    const getAddress = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            console.log('💼 My Points - Wallet address:', accounts[0]);
            setAddress(accounts[0]);
          } else {
            console.log('❌ My Points - No wallet connected');
            setAddress(null);
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
        console.log('🔄 My Points - Accounts changed:', accounts);
        if (accounts.length > 0) {
          console.log('💼 My Points - Account changed:', accounts[0]);
          setAddress(accounts[0]);
        } else {
          setAddress(null);
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

  // Fetch exchange history from blockchain
  const { data: exchangeHistory } = useQuery({
    queryKey: ["/api/exchanges/history", address],
    queryFn: async () => {
      if (!address) return [];
      
      try {
        // Normalize to lowercase for DB lookup
        const normalizedAddress = address.toLowerCase();
        
        // For now, we'll check if user exchanged today by checking the contract
        const { ethers } = await import('ethers');
        const provider = new ethers.BrowserProvider(window.ethereum as any);
        const contractAddress = '0xE42C06F57dac0D1bd1c794e2c495504A9CcD28B5';
        
        const contract = new ethers.Contract(
          contractAddress,
          ['function dailyExchanges(address, uint256) view returns (uint256 date, bool exchangedToday)'],
          provider
        );
        
        const today = Math.floor(Date.now() / (1000 * 86400));
        const dailyExchange = await contract.dailyExchanges(normalizedAddress, today);
        
        if (dailyExchange.exchangedToday) {
          // User exchanged today, return a placeholder
          return [{
            date: new Date().toISOString(),
            exchangedToday: true
          }];
        }
        
        return [];
      } catch (error) {
        console.error('Error fetching exchange history:', error);
        return [];
      }
    },
    enabled: Boolean(address),
  });

  const { data: pointsData, refetch } = useQuery({
    queryKey: ["/api/points", address],
    queryFn: async () => {
      if (!address) return null;
      // Normalize to lowercase for DB lookup
      const normalizedAddress = address.toLowerCase();
      console.log('🔍 Fetching points for:', normalizedAddress);
      const res = await fetch(`/api/points/${normalizedAddress}`);
      if (!res.ok) throw new Error("Failed to fetch points");
      const data = await res.json();
      console.log('✅ Points data:', data);
      return data;
    },
    enabled: Boolean(address),
  });

  const { data: predictionsData } = useQuery({
    queryKey: ["/api/predictions/user", address],
    queryFn: async () => {
      if (!address) return [];
      // Normalize to lowercase for DB lookup
      const normalizedAddress = address.toLowerCase();
      console.log('🎯 [MY-POINTS] Fetching predictions for:', normalizedAddress);
      const res = await fetch(`/api/predictions/user/${normalizedAddress}`);
      console.log('🎯 [MY-POINTS] Predictions response status:', res.status);
      if (!res.ok) {
        console.error('🎯 [MY-POINTS] Predictions fetch failed:', res.status);
        return [];
      }
      const data = await res.json();
      console.log('🎯 [MY-POINTS] Predictions data:', data);
      return data;
    },
    enabled: Boolean(address),
  });

  // Calculate win rate from predictions
  const calculateWinRate = () => {
    if (!predictionsData || predictionsData.length === 0) {
      return { winRate: 0, wins: 0, losses: 0, pending: 0 };
    }

    const settled = predictionsData.filter((p: any) => p.status === 'won' || p.status === 'lost');
    const wins = predictionsData.filter((p: any) => p.status === 'won').length;
    const losses = predictionsData.filter((p: any) => p.status === 'lost').length;
    const pending = predictionsData.filter((p: any) => p.status === 'pending').length;
    
    const winRate = settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0;
    
    return { winRate, wins, losses, pending };
  };

  const stats = calculateWinRate();

  // Fetch claim history
  const { data: claimsHistory } = useQuery({
    queryKey: ["/api/user/claims", address],
    queryFn: async () => {
      if (!address) return [];
      // Normalize to lowercase for DB lookup
      const normalizedAddress = address.toLowerCase();
      const res = await fetch('/api/user/claims', {
        headers: { 'x-wallet-address': normalizedAddress }
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(address),
  });

  if (!address) {
    return (
      <div className="min-h-screen predictions-bg -mt-16 pt-16">
        <div className="relative z-10 py-8 px-6">
          <Card className="p-8 text-center bg-purple-900/20 border-purple-700/30 backdrop-blur-md">
            <h2 className="text-2xl font-bold mb-4 text-purple-100">Connect Your Wallet</h2>
            <p className="text-purple-300">
              Please connect your wallet to view your points balance
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen predictions-bg -mt-16 pt-16">
      <div className="relative z-10 py-8 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">My Points</h1>
            <p className="text-purple-300 text-sm">Track your earnings, predictions, and activity</p>
          </div>
          <Button
            onClick={() => refetch()}
            variant="outline"
            className="bg-purple-900/30 border-purple-700/50 text-purple-200 hover:bg-purple-800/40"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Balance
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-purple-900/80 border-2 border-purple-600/60 backdrop-blur-md shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-500/30 rounded-xl border-2 border-yellow-500/50">
                <Coins className="h-6 w-6 text-yellow-300" />
              </div>
              <div>
                <p className="text-sm text-purple-100 font-medium mb-1">Total Points</p>
                <p className="text-3xl font-bold text-yellow-300">{pointsData?.totalPoints || 0}</p>
                <p className="text-xs text-purple-200 mt-1">Available to exchange</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-purple-900/80 border-2 border-purple-600/60 backdrop-blur-md shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/30 rounded-xl border-2 border-green-500/50">
                <TrendingUp className="h-6 w-6 text-green-300" />
              </div>
              <div>
                <p className="text-sm text-purple-100 font-medium mb-1">Win Rate</p>
                <p className="text-3xl font-bold text-green-300">{stats.winRate}%</p>
                <p className="text-xs text-purple-200 mt-1">{stats.wins}W / {stats.losses}L</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-purple-900/80 border-2 border-purple-600/60 backdrop-blur-md shadow-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/30 rounded-xl border-2 border-blue-500/50">
                <Activity className="h-6 w-6 text-blue-300" />
              </div>
              <div>
                <p className="text-sm text-purple-100 font-medium mb-1">Active Bets</p>
                <p className="text-3xl font-bold text-blue-300">{stats.pending}</p>
                <p className="text-xs text-purple-200 mt-1">Pending predictions</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Exchanges Section */}
        <Card className="p-6 bg-purple-900/80 border-2 border-purple-600/60 backdrop-blur-md shadow-xl mb-8">
          <div className="flex items-center gap-3 mb-4">
            <ArrowRightLeft className="h-5 w-5 text-purple-200" />
            <h2 className="text-xl font-bold text-white">Recent Exchanges</h2>
          </div>
          
          {exchangeHistory && exchangeHistory.length > 0 ? (
            <div className="space-y-3">
              {exchangeHistory.map((exchange: any, index: number) => (
                <div key={index} className="p-4 bg-purple-800/40 rounded-lg border border-purple-600/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium mb-1">✅ Exchange Successful</p>
                      <p className="text-purple-200 text-sm">
                        {new Date(exchange.date).toLocaleDateString()} at {new Date(exchange.date).toLocaleTimeString()}
                      </p>
                    </div>
                    <a 
                      href={`https://basescan.org/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-sm underline"
                    >
                      View on BaseScan →
                    </a>
                  </div>
                  <p className="text-purple-300 text-xs mt-2">
                    Tokens sent to your wallet • Check MetaMask for balance
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 bg-purple-700/40 rounded-full mb-4 border-2 border-purple-500/50">
                <ArrowRightLeft className="h-12 w-12 text-purple-200" />
              </div>
              <p className="text-purple-100 text-center mb-2 font-medium">No exchanges yet</p>
              <p className="text-purple-200 text-sm text-center">
                Convert your points to tokens to see your exchange history
              </p>
            </div>
          )}
        </Card>

        {/* Points History Section */}
        <Card className="p-6 bg-purple-900/80 border-2 border-purple-600/60 backdrop-blur-md shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <Coins className="h-5 w-5 text-purple-200" />
            <h2 className="text-xl font-bold text-white">Points History</h2>
          </div>
          
          {claimsHistory && claimsHistory.length > 0 ? (
            <div className="space-y-6">
              {(() => {
                // Group claims by date
                const now = new Date();
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const yesterdayStart = new Date(todayStart);
                yesterdayStart.setDate(yesterdayStart.getDate() - 1);
                
                const todayClaims = claimsHistory.filter((claim: any) => {
                  const claimDate = new Date(claim.claimedAt);
                  return claimDate >= todayStart;
                });
                
                const yesterdayClaims = claimsHistory.filter((claim: any) => {
                  const claimDate = new Date(claim.claimedAt);
                  return claimDate >= yesterdayStart && claimDate < todayStart;
                });
                
                const olderClaims = claimsHistory.filter((claim: any) => {
                  const claimDate = new Date(claim.claimedAt);
                  return claimDate < yesterdayStart;
                });
                
                return (
                  <>
                    {todayClaims.length > 0 && (
                      <div>
                        <h3 className="text-sm font-bold text-purple-200 mb-3 uppercase tracking-wide">Today</h3>
                        <div className="space-y-3">
                          {todayClaims.map((claim: any) => {
                            const section = claim.articleId.split('-')[0];
                            const sectionName = section.charAt(0).toUpperCase() + section.slice(1);
                            const date = new Date(claim.claimedAt);
                            
                            return (
                              <div 
                                key={claim.id}
                                className="flex items-center justify-between p-4 bg-purple-800/50 rounded-lg border-2 border-purple-600/50 hover:bg-purple-800/60 transition-colors"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="p-2 bg-yellow-500/30 rounded-lg border-2 border-yellow-500/50">
                                    <Coins className="h-5 w-5 text-yellow-300" />
                                  </div>
                                  <div>
                                    <p className="text-white font-semibold">{sectionName} Claim</p>
                                    <p className="text-purple-200 text-sm">
                                      {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-green-300 font-bold text-lg">+{claim.tokensEarned}</p>
                                  <p className="text-purple-200 text-xs">points</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {yesterdayClaims.length > 0 && (
                      <div>
                        <h3 className="text-sm font-bold text-purple-200 mb-3 uppercase tracking-wide">Yesterday</h3>
                        <div className="space-y-3">
                          {yesterdayClaims.map((claim: any) => {
                            const section = claim.articleId.split('-')[0];
                            const sectionName = section.charAt(0).toUpperCase() + section.slice(1);
                            const date = new Date(claim.claimedAt);
                            
                            return (
                              <div 
                                key={claim.id}
                                className="flex items-center justify-between p-4 bg-purple-800/50 rounded-lg border-2 border-purple-600/50 hover:bg-purple-800/60 transition-colors"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="p-2 bg-yellow-500/30 rounded-lg border-2 border-yellow-500/50">
                                    <Coins className="h-5 w-5 text-yellow-300" />
                                  </div>
                                  <div>
                                    <p className="text-white font-semibold">{sectionName} Claim</p>
                                    <p className="text-purple-200 text-sm">
                                      {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-green-300 font-bold text-lg">+{claim.tokensEarned}</p>
                                  <p className="text-purple-200 text-xs">points</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {olderClaims.length > 0 && (
                      <div>
                        <h3 className="text-sm font-bold text-purple-200 mb-3 uppercase tracking-wide">Older</h3>
                        <div className="space-y-3">
                          {olderClaims.map((claim: any) => {
                            const section = claim.articleId.split('-')[0];
                            const sectionName = section.charAt(0).toUpperCase() + section.slice(1);
                            const date = new Date(claim.claimedAt);
                            
                            return (
                              <div 
                                key={claim.id}
                                className="flex items-center justify-between p-4 bg-purple-800/50 rounded-lg border-2 border-purple-600/50 hover:bg-purple-800/60 transition-colors"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="p-2 bg-yellow-500/30 rounded-lg border-2 border-yellow-500/50">
                                    <Coins className="h-5 w-5 text-yellow-300" />
                                  </div>
                                  <div>
                                    <p className="text-white font-semibold">{sectionName} Claim</p>
                                    <p className="text-purple-200 text-sm">
                                      {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-green-300 font-bold text-lg">+{claim.tokensEarned}</p>
                                  <p className="text-purple-200 text-xs">points</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 bg-purple-700/40 rounded-full mb-4 border-2 border-purple-500/50">
                <Coins className="h-12 w-12 text-purple-200" />
              </div>
              <p className="text-purple-100 text-center mb-2 font-medium">No activity yet</p>
              <p className="text-purple-200 text-sm text-center">
                Your points earning history will appear here
              </p>
            </div>
          )}
        </Card>

        {/* Recent Predictions Section */}
        <Card className="p-6 bg-purple-900/80 border-2 border-purple-600/60 backdrop-blur-md shadow-xl mt-8">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="h-5 w-5 text-purple-200" />
            <h2 className="text-xl font-bold text-white">Recent Predictions</h2>
          </div>
          
          {predictionsData && predictionsData.length > 0 ? (
            <div className="space-y-3">
              {predictionsData.slice(0, 5).map((prediction: any) => {
                const statusColors = {
                  won: 'text-green-300 bg-green-500/20 border-green-500/50',
                  lost: 'text-red-300 bg-red-500/20 border-red-500/50',
                  pending: 'text-yellow-300 bg-yellow-500/20 border-yellow-500/50'
                };
                const statusColor = statusColors[prediction.status as keyof typeof statusColors] || statusColors.pending;
                
                return (
                  <div 
                    key={prediction.id}
                    className="flex items-center justify-between p-4 bg-purple-800/50 rounded-lg border-2 border-purple-600/50 hover:bg-purple-800/60 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-semibold">{prediction.pair}</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${statusColor}`}>
                          {prediction.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-purple-200 text-sm">
                        Predicted: {prediction.direction === 'up' ? '📈 UP' : '📉 DOWN'} • 
                        Bet: {prediction.amount} points
                      </p>
                    </div>
                    {prediction.status === 'won' && (
                      <div className="text-right">
                        <p className="text-green-300 font-bold">+{prediction.payout}</p>
                        <p className="text-purple-200 text-xs">points</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 bg-purple-700/40 rounded-full mb-4 border-2 border-purple-500/50">
                <TrendingUp className="h-12 w-12 text-purple-200" />
              </div>
              <p className="text-purple-100 text-center mb-2 font-medium">No predictions yet</p>
              <p className="text-purple-200 text-sm text-center">
                Make your first prediction to start earning
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
