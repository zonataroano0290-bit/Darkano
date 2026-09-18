import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Extract or generate unique correlation ID
  const requestId = (req.headers['x-request-id'] as string) || `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  req.id = requestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-ID', requestId);

  // Hook response completion to log status and latency
  res.on('finish', () => {
    const durationMs = Date.now() - (req.startTime || Date.now());
    const statusCode = res.statusCode;

    // Redact query params if sensitive
    let safeUrl = req.originalUrl || req.url;
    if (safeUrl.includes('token=')) {
      safeUrl = safeUrl.replace(/token=[^&]+/g, 'token=[REDACTED]');
    }

    // Only log API routes to keep logs clean
    if (safeUrl.startsWith('/api')) {
      const isError = statusCode >= 400;
      const logLevel = statusCode >= 500 ? 'ERROR' : isError ? 'WARN' : 'INFO';
      const logMessage = `[${logLevel}] [${requestId}] ${req.method} ${safeUrl} -> ${statusCode} (${durationMs}ms)`;

      if (statusCode >= 500) {
        console.error(logMessage);
      } else if (statusCode >= 400) {
        console.warn(logMessage);
      } else {
        // Routine info
        if (process.env.DEBUG_LOGS === 'true' || durationMs > 1000) {
          console.log(logMessage);
        }
      }
    }
  });

  next();
}
