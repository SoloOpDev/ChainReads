import type { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  requests: Map<string, number[]>;
  walletRequests: Map<string, number[]>;
}

const store: RateLimitStore = {
  requests: new Map(),
  walletRequests: new Map(),
};

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

/**
 * Enhanced rate limiter with IP and wallet-based tracking
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => req.ip || req.socket.remoteAddress || 'unknown',
    skipSuccessfulRequests = false,
    message = 'Too many requests, please try again later'
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    // Get request timestamps for this key
    const timestamps = store.requests.get(key) || [];
    
    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(t => now - t < windowMs);
    
    if (validTimestamps.length >= maxRequests) {
      return res.status(429).json({ 
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current timestamp
    validTimestamps.push(now);
    store.requests.set(key, validTimestamps);
    
    // Cleanup old entries periodically (1% chance)
    if (Math.random() < 0.01) {
      const entries = Array.from(store.requests.entries());
      for (const [k, times] of entries) {
        if (times.every((t: number) => now - t > windowMs)) {
          store.requests.delete(k);
        }
      }
    }
    
    next();
  };
}

/**
 * Wallet-based rate limiter (in addition to IP-based)
 */
export function createWalletRateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const walletAddress = req.walletAddress || req.headers['x-wallet-address'] as string;
    
    if (!walletAddress) {
      return next(); // Skip if no wallet
    }
    
    const key = walletAddress.toLowerCase();
    const now = Date.now();
    
    const timestamps = store.walletRequests.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);
    
    if (validTimestamps.length >= maxRequests) {
      return res.status(429).json({ 
        error: 'Too many requests from this wallet, please try again later',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    validTimestamps.push(now);
    store.walletRequests.set(key, validTimestamps);
    
    // Cleanup
    if (Math.random() < 0.01) {
      const entries = Array.from(store.walletRequests.entries());
      for (const [k, times] of entries) {
        if (times.every((t: number) => now - t > windowMs)) {
          store.walletRequests.delete(k);
        }
      }
    }
    
    next();
  };
}

/**
 * Global rate limiter for all endpoints
 */
export const globalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute per IP
  message: 'Too many requests from this IP, please slow down'
});

/**
 * Strict rate limiter for sensitive endpoints
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute
  message: 'Rate limit exceeded for this endpoint'
});
