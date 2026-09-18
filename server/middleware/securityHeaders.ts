import { Request, Response, NextFunction } from 'express';

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Strict referrer policy for privacy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable buggy legacy XSS auditor in modern browsers
  res.setHeader('X-XSS-Protection', '0');

  // Content security policy: allow safe local assets, fonts, icons, esm modules, images, and AI Studio preview framing
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' ws: wss: https:; " +
    "media-src 'self' blob: data:; " +
    "frame-src 'self' blob:; " +
    "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.run.app;"
  );

  // Cross-Origin Resource Sharing (CORS) defaults
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');

  // Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
