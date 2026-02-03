import type { Request, Response, NextFunction } from "express";

// Production-safe error handler
export function handleError(
  error: any,
  context: string,
  res: Response
): void {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // Log full error internally
  console.error(`[ERROR] ${context}:`, error);
  
  if (isDevelopment) {
    // Development: Send detailed error
    res.status(500).json({
      error: error.message || "Internal server error",
      context,
      stack: error.stack,
      details: error
    });
  } else {
    // Production: Send generic error
    res.status(500).json({
      error: "An error occurred. Please try again later.",
      context
    });
  }
}

// Async error wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      handleError(error, 'Request handler', res);
    });
  };
}

// Sanitize sensitive data from logs
export function sanitizeForLog(data: any): any {
  if (typeof data !== 'object' || data === null) return data;
  
  const sanitized = { ...data };
  const sensitiveKeys = ['password', 'privateKey', 'secret', 'token', 'signature'];
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

// Safe console.log for production
export function safeLog(context: string, data: any): void {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (isDevelopment) {
    console.log(`[${context}]`, data);
  } else {
    console.log(`[${context}]`, sanitizeForLog(data));
  }
}
