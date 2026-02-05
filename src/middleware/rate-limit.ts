/** Simple in-memory rate limiter — no external dependencies */

import { createMiddleware } from 'hono/factory';
import { getConnInfo } from '@hono/node-server/conninfo';
import { config } from '../config.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOpts {
  /** Max requests per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Resolve client IP: trust X-Forwarded-For only when the direct
 * connection comes from a configured trusted proxy (e.g. Caddy on 127.0.0.1).
 * Otherwise use the raw socket address.
 */
function getClientIp(c: Parameters<Parameters<typeof createMiddleware>[0]>[0]): string {
  const connInfo = getConnInfo(c);
  const socketIp = connInfo.remote.address || 'unknown';

  if (config.trustedProxies.length > 0 && config.trustedProxies.includes(socketIp)) {
    // Connection is from a trusted proxy — use the forwarded header
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0]!.trim();
    }
    const realIp = c.req.header('x-real-ip');
    if (realIp) return realIp;
  }

  return socketIp;
}

/**
 * Create a rate-limiting middleware.
 * Uses IP-based bucketing with automatic cleanup.
 */
export function rateLimiter({ limit, windowMs }: RateLimiterOpts) {
  const store = new Map<string, RateLimitEntry>();

  // Cleanup expired entries every 60s to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000).unref();

  return createMiddleware(async (c, next) => {
    const ip = getClientIp(c);

    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > limit) {
      return c.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Try again later.',
          },
        },
        429
      );
    }

    await next();
  });
}
