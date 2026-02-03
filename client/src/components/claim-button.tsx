import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet, CheckCircle2, Gift, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useSignMessage } from "wagmi";
import { getCachedAuthHeaders } from "@/lib/auth";

interface ClaimButtonProps {
  section: "news" | "trading" | "airdrop";
}

export function ClaimButton({ section }: ClaimButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scrolled, setScrolled] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [timerStarted, setTimerStarted] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { signMessageAsync } = useSignMessage();

  // Get wallet address from MetaMask
  useEffect(() => {
    const checkWallet = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
          } else {
            setWalletAddress(null);
          }
        } catch (error) {
          console.error('Error checking wallet:', error);
          setWalletAddress(null);
        }
      }
    };

    checkWallet();

    // Listen for account changes
    if (typeof window.ethereum !== 'undefined') {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
        } else {
          setWalletAddress(null);
        }
      };

      if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
      }
      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, []);

  const isConnected = !!walletAddress;

  const { data: claimStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/claim-status", walletAddress],
    queryFn: async () => {
      if (!walletAddress) {
        return { claimedSections: { news: false, airdrop: false, trading: false }, totalToday: 0 };
      }

      const res = await fetch("/api/claim-status", { 
        credentials: "include",
        headers: {
          "x-wallet-address": walletAddress,
        },
      });
      if (res.status === 401) {
        return { claimedSections: { news: false, airdrop: false, trading: false }, totalToday: 0 };
      }
      if (!res.ok) {
        console.error("Failed to fetch claim status:", res.status);
        return { claimedSections: { news: false, airdrop: false, trading: false }, totalToday: 0 };
      }
      return res.json();
    },
    refetchInterval: 60000,
    retry: 1,
    enabled: isConnected,
    staleTime: 5000,
    refetchOnMount: true,
  });

  const alreadyClaimed = claimStatus?.claimedSections?.[section] || false;

  // Scroll detection for non-news sections
  useEffect(() => {
    if (section === "news" || alreadyClaimed || !isConnected) return;

    const handleScroll = () => {
      if (!scrolled && window.scrollY > 50) {
        setScrolled(true);
        setTimerStarted(true);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [section, scrolled, alreadyClaimed, isConnected]);

  // Countdown timer
  useEffect(() => {
    if (!timerStarted || alreadyClaimed || !isConnected) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanClaim(true);
    }
  }, [timerStarted, countdown, alreadyClaimed, isConnected]);

  // Reset on section change
  useEffect(() => {
    setScrolled(false);
    setCountdown(10);
    setTimerStarted(false);
    setCanClaim(false);
  }, [section]);

  const claimMutation = useMutation({
    mutationFn: async () => {
      setClaiming(true);
      const startTime = Date.now();

      if (!walletAddress) {
        throw new Error("Wallet not connected");
      }

      // Get authentication headers with signature
      const authHeaders = await getCachedAuthHeaders(walletAddress, signMessageAsync);

      const res = await fetch("/api/claim-points", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ section }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to claim points");
      }

      const data = await res.json();
      const elapsed = Date.now() - startTime;
      if (elapsed < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
      }

      return data;
    },
    onSuccess: (data) => {
      console.log("=== CLAIM SUCCESS ===");
      console.log("Response data:", data);
      setClaiming(false);
      setClaimed(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);

      // Update wallet profile cache
      queryClient.setQueryData(["/api/wallet/profile", walletAddress], (old: any) => ({
        ...old,
        tokenBalance: data.newBalance,
        walletAddress: walletAddress,
      }));

      // Update claim status cache
      queryClient.setQueryData(["/api/claim-status", walletAddress], {
        claimedSections: data.claimedSections,
        totalToday: data.totalToday,
      });

      // Invalidate queries to refresh
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claim-status"] });

      toast({
        title: "🎉 Points Claimed Successfully!",
        description: `You earned ${data.pointsEarned} points! New balance: ${data.newBalance}`,
        duration: 5000,
      });

      setTimeout(() => setClaimed(false), 3000);
    },
    onError: (error: Error) => {
      setClaiming(false);
      const message = error.message;

      if (message.includes("IP address is already bound")) {
        toast({
          title: "Security Alert",
          description: message,
          variant: "destructive",
        });
      } else if (message.includes("already claimed")) {
        toast({
          title: "Already Claimed",
          description: message,
          variant: "destructive",
        });
      } else if (message.includes("Wallet not connected")) {
        toast({
          title: "Wallet Not Connected",
          description: "Please connect your wallet first.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Claim Failed",
          description: message,
          variant: "destructive",
        });
      }
    },
  });

  if (statusLoading) {
    return (
      <Button disabled className="bg-gray-600/40 text-gray-200 border-2 border-gray-400/50 cursor-not-allowed font-bold text-base shadow-lg">
        <Loader2 className="h-5 w-5 mr-2 animate-spin drop-shadow" />
        <span className="drop-shadow">Loading...</span>
      </Button>
    );
  }

  if (!isConnected) {
    const points = section === "news" ? 30 : 35;
    return (
      <Button disabled className="bg-purple-600/40 text-purple-100 border-2 border-purple-300/60 cursor-not-allowed font-bold text-base shadow-lg shadow-purple-500/30">
        <Wallet className="h-5 w-5 mr-2 drop-shadow" />
        <span className="drop-shadow">Connect Wallet to Claim {points} Points</span>
      </Button>
    );
  }

  if (alreadyClaimed || claimed) {
    const points = section === "news" ? 30 : 35;
    return (
      <div className="relative">
        <AnimatePresence>
          {showConfetti &&
            createPortal(
              <div className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center">
                {[...Array(50)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: (Math.random() - 0.5) * window.innerWidth * 0.8,
                      y: (Math.random() - 0.5) * window.innerHeight * 0.8,
                      opacity: 0,
                      scale: 0,
                      rotate: Math.random() * 1080,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2 + Math.random(), ease: "easeOut" }}
                    className="absolute"
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: Math.random() > 0.5 ? "50%" : "0%",
                      backgroundColor: ["#FFD700", "#FFA500", "#FF6347", "#00FF00", "#00CED1", "#FF1493", "#FFFF00", "#FF69B4"][
                        Math.floor(Math.random() * 8)
                      ],
                      boxShadow: "0 0 10px rgba(255,255,255,0.5)",
                    }}
                  />
                ))}
              </div>,
              document.body
            )}
        </AnimatePresence>

        <motion.div initial={claimed ? { scale: 0.8, opacity: 0 } : false} animate={claimed ? { scale: [0.8, 1.2, 1], opacity: 1 } : { scale: 1 }} transition={{ duration: 0.5, times: [0, 0.6, 1], ease: "easeOut" }}>
          <Button
            disabled
            className={`relative bg-gradient-to-r from-green-600 to-green-500 text-white border-2 border-green-300 cursor-not-allowed transition-all duration-500 font-black text-lg shadow-xl ${
              claimed ? "shadow-2xl shadow-green-400/80" : "shadow-lg shadow-green-500/50"
            }`}
          >
            {claimed && (
              <motion.div initial={{ scale: 0, rotate: 0 }} animate={{ scale: [0, 1.5, 1], rotate: [0, 180, 360] }} transition={{ duration: 0.6 }} className="absolute -top-2 -right-2">
                <CheckCircle2 className="h-6 w-6 text-yellow-300 drop-shadow-lg" />
              </motion.div>
            )}
            <CheckCircle2 className="h-6 w-6 mr-2 text-white drop-shadow-lg" />
            <span className="drop-shadow-lg">Claimed! +{points} pts ✓</span>
          </Button>
        </motion.div>
      </div>
    );
  }

  // News section - immediate claim
  if (section === "news") {
    const isPending = claimMutation.isPending || claiming;
    return (
      <Button
        onClick={() => claimMutation.mutate()}
        disabled={isPending}
        className={`relative overflow-hidden bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-black text-lg shadow-xl shadow-yellow-500/50 border-2 border-yellow-300/50 transition-all duration-300 ${
          isPending ? "opacity-90 cursor-wait scale-95" : "hover:scale-105 hover:shadow-2xl hover:shadow-yellow-400/60"
        }`}
      >
        {isPending ? (
          <>
            <Loader2 className="h-6 w-6 mr-2 animate-spin drop-shadow-lg" />
            <span className="drop-shadow-lg">Claiming Points...</span>
          </>
        ) : (
          <>
            <Gift className="h-6 w-6 mr-2 drop-shadow-lg" />
            <span className="drop-shadow-lg">Claim 30 Points</span>
          </>
        )}
      </Button>
    );
  }

  // Trading/Airdrop sections - scroll + timer
  if (scrolled) {
    if (canClaim) {
      return (
        <Button
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending || claiming}
          className={`relative overflow-hidden bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-black text-lg shadow-xl shadow-yellow-500/50 border-2 border-yellow-300/50 transition-all duration-300 ${
            claimMutation.isPending || claiming ? "opacity-90 cursor-wait scale-95" : "hover:scale-105 hover:shadow-2xl hover:shadow-yellow-400/60"
          }`}
        >
          {claimMutation.isPending || claiming ? (
            <>
              <Loader2 className="h-6 w-6 mr-2 animate-spin drop-shadow-lg" />
              <span className="drop-shadow-lg">Claiming Points...</span>
            </>
          ) : (
            <>
              <Gift className="h-6 w-6 mr-2 drop-shadow-lg" />
              <span className="drop-shadow-lg">Claim 35 Points</span>
            </>
          )}
        </Button>
      );
    } else {
      return (
        <Button disabled className="bg-blue-600/40 text-blue-100 border-2 border-blue-300/60 cursor-not-allowed font-black text-lg shadow-lg shadow-blue-500/30">
          <Clock className="h-5 w-5 mr-2 drop-shadow-lg" />
          <span className="drop-shadow-lg">Wait {countdown}s</span>
        </Button>
      );
    }
  }

  return (
    <Button disabled className="bg-gray-600/40 text-gray-200 border-2 border-gray-400/50 cursor-not-allowed font-bold text-base shadow-lg">
      <Clock className="h-5 w-5 mr-2" />
      <span className="drop-shadow">Scroll to Start Timer</span>
    </Button>
  );
}
