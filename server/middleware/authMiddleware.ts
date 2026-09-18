import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../db/authService.js';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  plan: string;
  role: 'user' | 'admin' | 'owner';
  creditBalance: number;
  createdAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function extractToken(req: Request): string | null {
  // 1. Check Authorization header: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Check query param for SSE or EventStream connections if needed
  if (req.query && typeof req.query.token === 'string') {
    return req.query.token;
  }

  // 3. Check Cookie header: darkano_session=<token>
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const c of cookies) {
      if (c.startsWith('darkano_session=')) {
        return decodeURIComponent(c.substring('darkano_session='.length));
      }
    }
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      error: 'Authentication required. Please sign in.',
      code: 'UNAUTHORIZED'
    });
    return;
  }

  const user = AuthService.validateSession(token);
  if (!user) {
    res.status(401).json({
      error: 'Session has expired or is invalid. Please sign in again.',
      code: 'SESSION_EXPIRED'
    });
    return;
  }

  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'owner')) {
      res.status(403).json({
        error: 'Forbidden. Administrator privileges required.',
        code: 'FORBIDDEN'
      });
      return;
    }
    next();
  });
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    const user = AuthService.validateSession(token);
    if (user) {
      req.user = user;
    }
  }
  next();
}
