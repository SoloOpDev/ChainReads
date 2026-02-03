import type { Request, Response, NextFunction } from 'express';
import { safeLog } from '../error-handler.js';

interface AuditLog {
  timestamp: string;
  walletAddress?: string;
  ip: string;
  endpoint: string;
  method: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

const auditLogs: AuditLog[] = [];
const MAX_LOGS = 10000; // Keep last 10k logs in memory

/**
 * Audit logger middleware for sensitive operations
 */
export function auditLogger(operation: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const walletAddress = req.walletAddress || req.headers['x-wallet-address'] as string;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                req.socket.remoteAddress || 
                'unknown';

    // Capture original json method
    const originalJson = res.json.bind(res);
    
    res.json = function(body: any) {
      const duration = Date.now() - startTime;
      const success = res.statusCode < 400;
      
      const log: AuditLog = {
        timestamp: new Date().toISOString(),
        walletAddress: walletAddress?.toLowerCase(),
        ip,
        endpoint: req.path,
        method: req.method,
        success,
        error: success ? undefined : body?.error || body?.message,
        metadata: {
          operation,
          duration,
          statusCode: res.statusCode,
          ...extractMetadata(req, body)
        }
      };

      // Add to in-memory logs
      auditLogs.push(log);
      if (auditLogs.length > MAX_LOGS) {
        auditLogs.shift(); // Remove oldest
      }

      // Log to console for external log aggregation
      safeLog('AUDIT', `${operation} | ${walletAddress || 'anonymous'} | ${ip} | ${success ? 'SUCCESS' : 'FAILED'} | ${duration}ms`);
      
      if (!success) {
        safeLog('AUDIT-ERROR', `${operation} failed: ${log.error}`);
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Extract relevant metadata from request/response
 */
function extractMetadata(req: Request, body: any): Record<string, any> {
  const metadata: Record<string, any> = {};

  // Extract claim-specific data
  if (req.path.includes('/claim')) {
    metadata.section = req.body?.section;
    metadata.articleId = req.body?.articleId;
    metadata.pointsEarned = body?.pointsEarned;
  }

  // Extract prediction-specific data
  if (req.path.includes('/predictions')) {
    metadata.predictionId = req.body?.predictionId;
    metadata.direction = req.body?.direction;
    metadata.amount = req.body?.amount;
  }

  // Extract exchange-specific data
  if (req.path.includes('/exchange')) {
    metadata.tokenId = req.body?.tokenId;
    metadata.points = req.body?.points;
  }

  return metadata;
}

/**
 * Get audit logs for a specific wallet
 */
export function getWalletAuditLogs(walletAddress: string, limit = 100): AuditLog[] {
  const normalized = walletAddress.toLowerCase();
  return auditLogs
    .filter(log => log.walletAddress === normalized)
    .slice(-limit)
    .reverse();
}

/**
 * Get recent failed operations
 */
export function getFailedOperations(limit = 100): AuditLog[] {
  return auditLogs
    .filter(log => !log.success)
    .slice(-limit)
    .reverse();
}

/**
 * Get audit statistics
 */
export function getAuditStats() {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentLogs = auditLogs.filter(log => 
    new Date(log.timestamp).getTime() > oneHourAgo
  );

  return {
    totalLogs: auditLogs.length,
    recentLogs: recentLogs.length,
    failedOperations: recentLogs.filter(l => !l.success).length,
    successRate: recentLogs.length > 0 
      ? ((recentLogs.filter(l => l.success).length / recentLogs.length) * 100).toFixed(2) + '%'
      : 'N/A',
    uniqueWallets: new Set(recentLogs.map(l => l.walletAddress).filter(Boolean)).size,
    uniqueIPs: new Set(recentLogs.map(l => l.ip)).size,
  };
}
