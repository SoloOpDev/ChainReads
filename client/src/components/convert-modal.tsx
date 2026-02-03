import { useState, useMemo, useEffect, useRef } from "react";
import { X, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { getWalletAddress } from "@/lib/wallet";
import { getCachedAuthHeaders } from "@/lib/auth";

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Contract address from environment
const CONTRACT_ADDRESS = (import.meta.env.VITE_POINTS_CLAIM_CONTRACT || import.meta.env.VITE_CONTRACT_ADDRESS || '') as `0x${string}`;

// Full ABI for exchange contract
const EXCHANGE_ABI = [
  {
    inputs: [],
    name: "getExchangeRates",
    outputs: [{ internalType: "uint256[10]", name: "", type: "uint256[10]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint256", name: "points", type: "uint256" },
      { internalType: "bytes32", name: "nonce", type: "bytes32" },
      { internalType: "uint256", name: "expiration", type: "uint256" },
      { internalType: "bytes", name: "signature", type: "bytes" }
    ],
    name: "exchangePointsForTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const TOKENS = [
  { id: "brett", name: "BRETT", symbol: "BRETT", index: 0, available: true },
  { id: "toshi", name: "TOSHI", symbol: "TOSHI", index: 1, available: true },
  { id: "degen", name: "DEGEN", symbol: "DEGEN", index: 2, available: true },
  { id: "tkn4", name: "TKN", symbol: "TKN", index: 3, available: false },
  { id: "tkn5", name: "TKN", symbol: "TKN", index: 4, available: false },
  { id: "tkn6", name: "TKN", symbol: "TKN", index: 5, available: false },
  { id: "tkn7", name: "TKN", symbol: "TKN", index: 6, available: false },
  { id: "tkn8", name: "TKN", symbol: "TKN", index: 7, available: false },
];

export function ConvertModal({ isOpen, onClose }: ConvertModalProps) {
  const [selectedToken, setSelectedToken] = useState("degen");
  const [points, setPoints] = useState("");
  const [isExchanging, setIsExchanging] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasConfirmed = useRef(false);

  // Get wallet address from cached function (prevents MetaMask spam)
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const hasCheckedWallet = useRef(false);
  
  useEffect(() => {
    const fetchAddress = async () => {
      // Only check once when modal opens
      if (isOpen && !hasCheckedWallet.current) {
        hasCheckedWallet.current = true;
        const address = await getWalletAddress();
        if (address) {
          setWalletAddress(address);
          console.log('💼 Convert Modal - Wallet connected:', address);
        } else {
          setWalletAddress(null);
          toast({
            title: "Wallet Not Connected",
            description: "Please connect your wallet first",
            variant: "destructive",
          });
          onClose();
        }
      }
      
      // Reset flag when modal closes
      if (!isOpen) {
        hasCheckedWallet.current = false;
      }
    };
    fetchAddress();
  }, [isOpen]); // Removed toast and onClose from deps

  const { data: profile } = useQuery({
    queryKey: ["/api/wallet/profile", walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('No wallet connected');
      const res = await fetch(`/api/wallet/profile?wallet=${walletAddress}`);
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!walletAddress && isOpen,
  });

  const { writeContract, data: hash, isPending: isWritePending, reset, error: writeError } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError, status } = useWaitForTransactionReceipt({
    hash,
  });

  // Log transaction status
  useEffect(() => {
    if (hash) {
      console.log('🔗 Transaction hash:', hash);
    }
    if (isConfirming) {
      console.log('⏳ Waiting for confirmation...');
    }
    if (isConfirmed) {
      console.log('✅ Transaction confirmed!');
    }
    if (status === 'error' || confirmError) {
      console.error('❌ Transaction failed:', confirmError);
    }
    if (writeError) {
      console.error('❌ Write error:', writeError);
    }
  }, [hash, isConfirming, isConfirmed, writeError, confirmError, status]);

  // Handle transaction failure
  useEffect(() => {
    if (status === 'error' && isExchanging) {
      console.error('❌ Transaction reverted on blockchain');
      setIsExchanging(false);
      toast({
        title: "Transaction Failed",
        description: "The transaction was reverted by the contract. This could be due to: already exchanged today, insufficient contract balance, or invalid signature.",
        variant: "destructive",
      });
      reset();
    }
  }, [status, isExchanging, toast, reset]);

  // Handle write errors (user rejection, etc.) - Watch isPending changes
  useEffect(() => {
    // When isPending goes from true to false without a hash, it means error or rejection
    if (!isWritePending && !hash && isExchanging && writeError) {
      console.error('❌ Write error detected:', writeError);
      
      let errorTitle = "Transaction Failed";
      let errorDescription = writeError.message || "Failed to send transaction";
      
      if ((writeError as any).code === 4001 ||
          writeError.message?.includes('User rejected') ||
          writeError.message?.includes('User denied') ||
          writeError.message?.includes('user rejected')) {
        errorTitle = "Transaction Cancelled";
        errorDescription = "You cancelled the transaction in MetaMask.";
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
      
      setIsExchanging(false);
      reset();
    }
  }, [isWritePending, hash, isExchanging, writeError, toast, reset]);

  // Read exchange rates from smart contract
  const { data: exchangeRates } = useReadContract({
    abi: EXCHANGE_ABI,
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: 'getExchangeRates',
    query: { enabled: Boolean(CONTRACT_ADDRESS) },
  });

  const availablePoints = (profile as any)?.tokenBalance || 0;
  const selectedTokenData = TOKENS.find((t) => t.id === selectedToken);
  
  // Get rate from smart contract or fallback to hardcoded
  const rate = useMemo(() => {
    if (exchangeRates && selectedTokenData) {
      const contractRate = Number(exchangeRates[selectedTokenData.index]);
      return contractRate > 0 ? contractRate : 
        (selectedTokenData.id === 'brett' ? 33 : 
         selectedTokenData.id === 'toshi' ? 2222 : 606);
    }
    return selectedTokenData?.id === 'brett' ? 33 : 
           selectedTokenData?.id === 'toshi' ? 2222 : 606;
  }, [exchangeRates, selectedTokenData]);
  
  // Calculate tokens: (points * rate) / 1000
  const tokensToReceive = points && selectedTokenData
    ? ((Number(points) * rate) / 1000).toFixed(4)
    : "0.0000";

  const handleExchange = async () => {
    const pointsNum = Number(points);
    
    if (!walletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to exchange points",
        variant: "destructive",
      });
      return;
    }

    if (pointsNum < 300) {
      toast({
        title: "Minimum Required",
        description: "Minimum exchange is 300 points",
        variant: "destructive",
      });
      return;
    }

    if (pointsNum > 5000) {
      toast({
        title: "Maximum Exceeded",
        description: "Maximum exchange is 5,000 points per day",
        variant: "destructive",
      });
      return;
    }

    if (pointsNum > availablePoints) {
      toast({
        title: "Insufficient Points",
        description: `You only have ${availablePoints} points available`,
        variant: "destructive",
      });
      return;
    }

    if (!selectedTokenData) {
      toast({
        title: "No Token Selected",
        description: "Please select a token to receive",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsExchanging(true);

      // Get authentication headers
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }
      
      // Simple sign function using window.ethereum
      const signMessage = async (message: string): Promise<string> => {
        if (!window.ethereum) throw new Error("No wallet found");
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, walletAddress],
        });
        return signature as string;
      };
      
      const authHeaders = await getCachedAuthHeaders(walletAddress, signMessage);

      // Get signature from backend
      const signResponse = await fetch('/api/exchange/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          tokenId: selectedTokenData.index + 1, // Contract uses 1-indexed
          points: pointsNum,
        }),
      });

      if (!signResponse.ok) {
        const error = await signResponse.json();
        throw new Error(error.error || 'Failed to get signature');
      }

      const { nonce, expiration, signature } = await signResponse.json();

      toast({
        title: "Transaction Pending",
        description: "Please confirm the transaction in your wallet...",
      });

      // Call smart contract
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: EXCHANGE_ABI,
        functionName: 'exchangePointsForTokens',
        args: [
          BigInt(selectedTokenData.index + 1),
          BigInt(pointsNum),
          nonce as `0x${string}`,
          BigInt(expiration),
          signature as `0x${string}`,
        ],
      });

    } catch (error: any) {
      console.error('Exchange error:', error);
      
      let errorTitle = "Exchange Failed";
      let errorDescription = error.message || "Failed to exchange points";
      
      if (error.message?.includes('unavailable')) {
        const tokenMatch = error.message.match(/(BRETT|TOSHI|DEGEN) unavailable/);
        const token = tokenMatch ? tokenMatch[1] : selectedTokenData?.symbol;
        
        errorTitle = `${token} Unavailable`;
        errorDescription = `The contract doesn't have enough ${token} tokens right now. ${token !== 'DEGEN' ? 'Try exchanging for DEGEN instead.' : 'Please try again later or contact support.'}`;
      }
      // User rejection
      else if (error.name === 'UserRejectedRequestError' || 
          error.code === 4001 || 
          error.code === 'ACTION_REJECTED' ||
          error.message?.includes('User rejected') || 
          error.message?.includes('User denied') ||
          error.message?.includes('user rejected')) {
        errorTitle = "Transaction Cancelled";
        errorDescription = "You cancelled the transaction in MetaMask. Click 'Exchange' again when you're ready.";
      }
      // Daily limit
      else if (error.message?.includes('Already exchanged today') || 
               error.message?.includes('once per day')) {
        errorTitle = "Daily Limit Reached";
        errorDescription = "You can only exchange once per day. Come back tomorrow to exchange again!";
      }
      // Insufficient contract balance
      else if (error.message?.includes('Insufficient contract balance')) {
        errorTitle = "Token Unavailable";
        errorDescription = `The contract doesn't have enough ${selectedTokenData?.symbol} tokens. ${selectedTokenData?.symbol !== 'DEGEN' ? 'Try DEGEN instead.' : 'Please contact support.'}`;
      }
      // Insufficient points
      else if (error.message?.includes('Insufficient points')) {
        errorTitle = "Not Enough Points";
        errorDescription = `You need at least ${points} points to make this exchange. Earn more points by reading articles and making predictions.`;
      }
      // Signature expired
      else if (error.message?.includes('Signature expired')) {
        errorTitle = "Signature Expired";
        errorDescription = "The exchange signature expired after 1 hour. Click 'Exchange' to get a new signature.";
      }
      // Nonce already used
      else if (error.message?.includes('Nonce already used')) {
        errorTitle = "Already Processed";
        errorDescription = "This exchange was already completed. Check your wallet for the tokens.";
      }
      // Rate limit
      else if (error.message?.includes('rate limit') || 
               error.message?.includes('Too many')) {
        errorTitle = "Too Many Requests";
        errorDescription = "You're making requests too quickly. Please wait 60 seconds before trying again.";
      }
      // Wrong network
      else if (error.message?.includes('wrong network') || 
               error.message?.includes('chain')) {
        errorTitle = "Wrong Network";
        errorDescription = "Please switch to Base network in MetaMask. Click the network dropdown and select 'Base'.";
      }
      // Insufficient gas
      else if (error.message?.includes('insufficient funds') || 
               error.message?.includes('gas')) {
        errorTitle = "Insufficient Gas";
        errorDescription = "You don't have enough ETH to pay for gas fees. Add some ETH to your wallet (~$0.50 should be enough).";
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
        duration: 7000,
      });
      setIsExchanging(false);
      reset(); // Reset write contract state
    }
  };

  // Handle transaction confirmation with useEffect to avoid multiple calls
  useEffect(() => {
    if (isConfirmed && isExchanging && hash && !hasConfirmed.current) {
      hasConfirmed.current = true;
      
      console.log('🎉 Transaction confirmed, calling backend...');
      
      // Call backend to confirm and deduct points
      fetch('/api/exchange/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: walletAddress,
          points: Number(points),
          txHash: hash,
        }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          console.log('Exchange confirmed:', data);
          
          setIsExchanging(false);
          toast({
            title: "Exchange Successful! 🎉",
            description: `You received ${tokensToReceive} ${selectedTokenData?.symbol}`,
          });
          
          // Invalidate queries to refresh balance
          queryClient.invalidateQueries({ queryKey: ["/api/wallet/profile"] });
          
          setPoints("");
          reset();
          onClose();
        } else {
          const error = await res.json();
          console.error('Failed to confirm exchange:', error);
          setIsExchanging(false);
          toast({
            title: "Confirmation Failed",
            description: error.error || "Failed to update balance",
            variant: "destructive",
          });
        }
      }).catch(err => {
        console.error('Failed to confirm exchange:', err);
        setIsExchanging(false);
        toast({
          title: "Confirmation Failed",
          description: "Failed to update balance",
          variant: "destructive",
        });
      });
    }
  }, [isConfirmed, isExchanging, hash, walletAddress, points, tokensToReceive, selectedTokenData, toast, queryClient, onClose, reset]);

  // Reset confirmation flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasConfirmed.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - No blur, just click to close */}
      <div
        className="fixed inset-0 z-[10000]"
        onClick={onClose}
      />

      {/* Modal - Below navbar with space from bottom */}
      <div className="fixed inset-0 z-[10001] flex items-start justify-center pt-16 pb-6 p-4 pointer-events-none overflow-y-auto">
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/30 shadow-2xl overflow-hidden pointer-events-auto my-auto"
        >
          {/* Header */}
          <div className="relative p-6 pb-4">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white hover:text-gray-300" />
            </button>

            <h2 className="text-2xl font-bold text-white mb-1">
              Convert Points to Tokens
            </h2>
            <p className="text-white/70 text-xs">
              Exchange your earned points for real tokens on Base blockchain
            </p>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 space-y-4">
            {/* Token Selection */}
            <div>
              <label className="text-xs font-medium text-white mb-2 block">
                Select Token to Receive
              </label>
              <div className="grid grid-cols-5 gap-2">
                {TOKENS.map((token) => (
                  <button
                    key={token.id}
                    onClick={() => token.available && setSelectedToken(token.id)}
                    disabled={!token.available}
                    className={`relative h-12 text-sm font-bold rounded-lg transition-all backdrop-blur-sm ${
                      selectedToken === token.id && token.available
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/50 scale-105"
                        : token.available
                        ? "bg-white/30 border border-white/40 text-white hover:bg-white/40 hover:border-white/50"
                        : "bg-white/10 border border-white/20 text-white/40 cursor-not-allowed"
                    }`}
                  >
                    {token.symbol}
                    {!token.available && (
                      <span className="absolute top-0.5 right-0.5 text-[9px] text-yellow-500 font-bold">
                        Soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-yellow-400 mt-2 flex items-center gap-1">
                💡 All tokens are now available for exchange!
              </p>
            </div>

            {/* Points Input */}
            <div>
              <label className="text-xs font-medium text-white mb-1.5 block">
                Points to Exchange (Min: 300, Max: 5,000)
              </label>
              <div className="relative">
                <Input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="300"
                  min={300}
                  max={Math.min(5000, availablePoints)}
                  className="h-12 text-base bg-white/10 border-2 border-white/20 text-white pr-20 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 rounded-lg placeholder:text-white/50"
                />
                <Button
                  onClick={() => setPoints(Math.min(5000, availablePoints).toString())}
                  className="absolute right-1.5 top-1.5 h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-md"
                >
                  MAX
                </Button>
              </div>
              <p className="text-[10px] text-white/60 mt-1.5">
                Available: {availablePoints} points
              </p>
            </div>

            {/* Exchange Info */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/70">Exchange Rate:</span>
                <span className="text-white font-medium text-xs">
                  {rate} points = 1 {selectedTokenData?.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">
                  {points || "0"} points gets you:
                </span>
                <span className="text-lg font-bold text-yellow-400">
                  {tokensToReceive} {selectedTokenData?.symbol}
                </span>
              </div>

              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-white/80">
                    You will receive:
                  </span>
                  <span className="text-xl font-bold text-green-400">
                    {tokensToReceive} {selectedTokenData?.symbol}
                  </span>
                </div>
              </div>
            </div>

            {/* Exchange Button */}
            <Button
              onClick={handleExchange}
              disabled={!points || Number(points) < 300 || Number(points) > 5000 || Number(points) > availablePoints || isExchanging || isWritePending || isConfirming}
              className="w-full h-12 text-base font-bold bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg rounded-lg"
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              {isWritePending ? "Waiting for Approval..." : 
               isConfirming ? "Confirming Transaction..." :
               isExchanging ? "Processing..." :
               "Exchange Points for Tokens"}
            </Button>

            <div className="text-center space-y-0.5">
              <p className="text-xs font-bold text-white">
                One exchange per day
              </p>
              <p className="text-[10px] text-white/70">
                Minimum 300 points • Maximum 5,000 points per exchange
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
