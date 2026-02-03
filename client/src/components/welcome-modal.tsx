import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, TrendingUp, Newspaper, Gift, X } from "lucide-react";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only show once per browser - check localStorage
    const hasSeenWelcome = localStorage.getItem('chainreads-welcome-seen');
    console.log('Welcome modal check:', hasSeenWelcome ? 'Already seen' : 'First visit - showing modal');
    
    if (!hasSeenWelcome) {
      // Small delay for better UX
      setTimeout(() => setOpen(true), 500);
    }
  }, []);

  const handleClose = () => {
    // Mark as seen in localStorage
    localStorage.setItem('chainreads-welcome-seen', 'true');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
    }}>
      <DialogContent className="max-w-lg backdrop-blur-xl bg-white/10 border border-white/20 text-white shadow-2xl max-h-[85vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-1 hover:bg-white/20 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            Welcome to ChainReads! 🎉
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* What is ChainReads */}
          <p className="text-sm text-white/90 text-center">
            Read crypto news, make predictions, discover airdrops - earn points you can convert to real tokens!
          </p>

          {/* How to Earn Points */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-white/90">Earn Points Daily:</h3>
            
            <div className="space-y-2">
              {/* News */}
              <div className="flex gap-2 p-2 bg-white/5 rounded-lg border border-white/10">
                <Newspaper className="h-4 w-4 text-blue-300 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold">News:</span> <span className="text-yellow-300">10 pts</span> per article, up to 3/day
                </div>
              </div>

              {/* Trading */}
              <div className="flex gap-2 p-2 bg-white/5 rounded-lg border border-white/10">
                <TrendingUp className="h-4 w-4 text-purple-300 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold">Trading:</span> <span className="text-yellow-300">35 pts</span> once/day
                </div>
              </div>

              {/* Airdrops */}
              <div className="flex gap-2 p-2 bg-white/5 rounded-lg border border-white/10">
                <Gift className="h-4 w-4 text-green-300 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold">Airdrops:</span> <span className="text-yellow-300">35 pts</span> once/day
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="p-2 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 rounded-lg border border-yellow-500/30 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Coins className="h-4 w-4 text-yellow-300" />
                <span className="text-lg font-bold text-yellow-300">100 pts/day max</span>
              </div>
            </div>
          </div>

          {/* Quick Rules */}
          <div className="space-y-1.5 text-xs text-white/80">
            <p>• Connect wallet to start earning</p>
            <p>• One device per wallet</p>
            <p>• Resets daily at midnight UTC</p>
          </div>

          {/* CTA */}
          <Button
            onClick={handleClose}
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white font-semibold"
          >
            Let's Go! 🚀
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
