import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  category: string;
}

interface ClientRecord {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private records = new Map<string, ClientRecord>();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly category: string;

  constructor(config: RateLimitConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.category = config.category;

    // Periodic sweep every 5 minutes to prevent memory bloat
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.records.entries()) {
        record.timestamps = record.timestamps.filter(t => now - t < this.windowMs);
        if (record.timestamps.length === 0) {
          this.records.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }
  }

  middleware = (req: Request, res: Response, next: NextFunction): void => {
    // Determine client identifier: authenticated userId if available, else IP
    const clientId = (req as any).user?.userId ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown-client';

    const key = `${this.category}:${clientId}`;
    const now = Date.now();

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out timestamps older than the window
    record.timestamps = record.timestamps.filter(t => now - t < this.windowMs);

    const remaining = Math.max(0, this.maxRequests - record.timestamps.length);
    const resetTime = Math.ceil((now + this.windowMs) / 1000);

    res.setHeader('RateLimit-Limit', this.maxRequests.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', resetTime.toString());

    if (record.timestamps.length >= this.maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds.toString());

      res.status(429).json({
        error: `Too many requests for ${this.category}. Please slow down and try again in ${retryAfterSeconds} second(s).`,
        code: 'RATE_LIMIT_EXCEEDED',
        category: this.category,
        retryAfterSeconds
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}

// Preset rate limiters for Darkano AI routes
export const authRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 15,
  category: 'authentication'
}).middleware;

export const chatRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  category: 'ai_chat'
}).middleware;

export const expensiveAiRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  category: 'multimodal_media'
}).middleware;

export const searchRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 40,
  category: 'web_search'
}).middleware;

export const buildRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 25,
  category: 'project_build'
}).middleware;

export const uploadRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  category: 'file_upload'
}).middleware;

export const generalApiRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 400,
  category: 'general_api'
}).middleware;
