// Wallet utility to prevent spamming MetaMask with requests
let cachedAddress: string | null = null;
let lastCheck: number = 0;
const CACHE_DURATION = 2000; // 2 seconds cache

export async function getWalletAddress(): Promise<string | null> {
  const now = Date.now();
  
  // Return cached address if recent
  if (cachedAddress && (now - lastCheck) < CACHE_DURATION) {
    return cachedAddress;
  }
  
  // Check MetaMask
  if (typeof window.ethereum !== 'undefined') {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      cachedAddress = accounts && accounts.length > 0 ? accounts[0] : null;
      lastCheck = now;
      return cachedAddress;
    } catch (error) {
      console.error('Error getting wallet:', error);
      return null;
    }
  }
  
  return null;
}

// Clear cache when wallet changes
export function clearWalletCache() {
  cachedAddress = null;
  lastCheck = 0;
}

// Listen for account changes and clear cache
if (typeof window !== 'undefined' && typeof window.ethereum !== 'undefined') {
  window.ethereum.on?.('accountsChanged', () => {
    clearWalletCache();
  });
}
