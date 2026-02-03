import type { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";

// Normalize wallet addresses
export function normalizeAddress(address: string | undefined | null): string {
  if (!address) return '';
  return address.trim().toLowerCase();
}

// Validate Ethereum address format
export function isValidEthereumAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  return /^(0x)?[a-f0-9]{40}$/.test(normalized);
}

// Verify wallet signature
export async function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
  } catch (error) {
    console.error('[AUTH] Signature verification failed:', error);
    return false;
  }
}

// Middleware to verify wallet ownership
export async function requireWalletAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const walletAddress = req.headers['x-wallet-address'] as string;
    const signature = req.headers['x-wallet-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    if (!walletAddress || !signature || !timestamp) {
      return res.status(401).json({ 
        error: "Authentication required",
        details: "Missing wallet address, signature, or timestamp"
      });
    }

    // Validate address format
    if (!isValidEthereumAddress(walletAddress)) {
      return res.status(401).json({ error: "Invalid wallet address format" });
    }

    // Check timestamp (prevent replay attacks - 5 minute window)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    
    if (isNaN(requestTime)) {
      return res.status(401).json({ error: "Invalid timestamp" });
    }

    const timeDiff = Math.abs(now - requestTime);
    if (timeDiff > 5 * 60 * 1000) { // 5 minutes
      return res.status(401).json({ 
        error: "Signature expired",
        details: "Please reconnect your wallet"
      });
    }

    // Construct message (same format client uses)
    const message = `Authenticate wallet: ${walletAddress}\nTimestamp: ${timestamp}`;

    // Verify signature
    const isValid = await verifyWalletSignature(walletAddress, message, signature);
    
    if (!isValid) {
      return res.status(401).json({ 
        error: "Invalid signature",
        details: "Signature verification failed"
      });
    }

    // Store normalized address in request for downstream use
    req.walletAddress = normalizeAddress(walletAddress);
    next();
  } catch (error) {
    console.error('[AUTH] Authentication error:', error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

// Check wallet transaction history (anti-sybil)
export async function checkWalletHistory(
  walletAddress: string,
  minTransactions: number = 5
): Promise<{ valid: boolean; txCount: number; error?: string }> {
  try {
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    
    // Get transaction count
    const txCount = await provider.getTransactionCount(walletAddress);
    
    if (txCount < minTransactions) {
      return {
        valid: false,
        txCount,
        error: `Wallet must have at least ${minTransactions} transactions. Current: ${txCount}`
      };
    }

    return { valid: true, txCount };
  } catch (error) {
    console.error('[AUTH] Failed to check wallet history:', error);
    // Don't block on API errors - fail open for now
    return { valid: true, txCount: 0 };
  }
}

// Middleware to check wallet transaction history
export async function requireWalletHistory(minTx: number = 5) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const walletAddress = req.walletAddress || req.headers['x-wallet-address'] as string;
      
      if (!walletAddress) {
        return res.status(401).json({ error: "Wallet address required" });
      }

      const result = await checkWalletHistory(normalizeAddress(walletAddress), minTx);
      
      if (!result.valid) {
        return res.status(403).json({ 
          error: "Wallet requirements not met",
          details: result.error,
          txCount: result.txCount,
          required: minTx
        });
      }

      next();
    } catch (error) {
      console.error('[AUTH] Wallet history check error:', error);
      // Fail open - don't block legitimate users on API errors
      next();
    }
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      walletAddress?: string;
    }
  }
}
