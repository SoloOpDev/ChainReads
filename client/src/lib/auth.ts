import type { SignMessageMutateAsync } from 'wagmi/query';

/**
 * Generate authentication headers with wallet signature
 * Required for all wallet-based API endpoints
 */
export async function getAuthHeaders(
  walletAddress: string,
  signMessage: SignMessageMutateAsync
): Promise<Record<string, string>> {
  const timestamp = Date.now().toString();
  const message = `Authenticate wallet: ${walletAddress}\nTimestamp: ${timestamp}`;
  
  try {
    const signature = await signMessage({ message });
    
    return {
      'x-wallet-address': walletAddress,
      'x-wallet-signature': signature,
      'x-timestamp': timestamp
    };
  } catch (error) {
    console.error('[AUTH] Failed to sign message:', error);
    throw new Error('Failed to sign authentication message');
  }
}

/**
 * Check if signature is still valid (within 5 minute window)
 */
export function isSignatureValid(timestamp: string): boolean {
  const now = Date.now();
  const signTime = parseInt(timestamp);
  const diff = Math.abs(now - signTime);
  return diff < 5 * 60 * 1000; // 5 minutes
}

/**
 * Cache for auth headers to avoid repeated signing
 * Expires after 4 minutes (before 5 minute server timeout)
 */
interface CachedAuth {
  headers: Record<string, string>;
  expiresAt: number;
}

const authCache = new Map<string, CachedAuth>();

/**
 * Get cached auth headers or generate new ones
 * Automatically re-signs if cache expired
 */
export async function getCachedAuthHeaders(
  walletAddress: string,
  signMessage: SignMessageMutateAsync
): Promise<Record<string, string>> {
  const cached = authCache.get(walletAddress);
  
  // Check if cache is still valid (4 minutes)
  if (cached && Date.now() < cached.expiresAt) {
    console.log('[AUTH] Using cached signature');
    return cached.headers;
  }
  
  // Generate new signature
  console.log('[AUTH] Generating new signature');
  const headers = await getAuthHeaders(walletAddress, signMessage);
  
  // Cache for 4 minutes
  authCache.set(walletAddress, {
    headers,
    expiresAt: Date.now() + 4 * 60 * 1000
  });
  
  return headers;
}

/**
 * Clear cached auth for a wallet (e.g., on disconnect)
 */
export function clearAuthCache(walletAddress?: string) {
  if (walletAddress) {
    authCache.delete(walletAddress);
  } else {
    authCache.clear();
  }
}
