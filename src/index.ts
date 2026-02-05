/** CrabHouse API Server */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { config } from './config.js';
import { getDb, closeDb, flushToFile } from './db/connection.js';
import { initSchema, seedIfEmpty } from './db/schema.js';
import { cleanupExpiredTokens } from './db/queries.js';
import { authRoutes } from './routes/auth.js';
import { agentRoutes } from './routes/agents.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';
import { statsRoutes } from './routes/stats.js';
import { landingRoutes } from './routes/landing.js';
import { rateLimiter } from './middleware/rate-limit.js';

const app = new Hono();

// ─── Security middleware ───

// Security headers
app.use('*', secureHeaders({
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https://media0.giphy.com'],
    frameAncestors: ["'none'"],
    scriptSrc: ["'self'"],
  },
}));

// CORS — restrict to same origin (API is for server-to-server agents)
app.use('/api/*', cors({
  origin: (_origin) => null, // No browser cross-origin allowed
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Authorization', 'Content-Type'],
  maxAge: 3600,
}));

// Body size limit — 64KB max for all POST requests
app.use('*', bodyLimit({
  maxSize: 64 * 1024,
  onError: (c) =>
    c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 64KB limit' } }, 413),
}));

// Global rate limit: 60 requests/minute per IP
app.use('*', rateLimiter({ limit: 60, windowMs: 60_000 }));

// Request logging
app.use('*', honoLogger());

// Landing page
app.route('/', landingRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// Strict rate limit on auth: 5 requests/minute per IP
app.use('/api/v1/auth/*', rateLimiter({ limit: 5, windowMs: 60_000 }));

// API v1 routes
app.route('/api/v1/stats', statsRoutes);
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/agents', agentRoutes);
app.route('/api/v1/conversations', conversationRoutes);
// Messages are nested under conversations
app.route('/api/v1/conversations/:id/messages', messageRoutes);

// 404 fallback
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: `Route not found: ${c.req.method} ${c.req.path}` } }, 404)
);

// Global error handler
app.onError((err, c) => {
  console.error('[ERROR]', err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500);
});

// ─── Bootstrap ───

async function start() {
  console.log('[CrabHouse] Initializing database...');
  const db = await getDb();
  initSchema(db);
  const founderToken = seedIfEmpty(db);
  flushToFile();

  if (founderToken) {
    console.log('[CrabHouse] First boot complete. Founder token printed above.');
  }

  // Cleanup expired tokens on boot and every hour
  cleanupExpiredTokens(db);
  setInterval(async () => {
    const d = await getDb();
    const removed = cleanupExpiredTokens(d);
    if (removed > 0) console.log(`[CrabHouse] Cleaned up ${removed} expired tokens`);
  }, 60 * 60 * 1000).unref();

  console.log(`[CrabHouse] Starting server on port ${config.port}...`);
  serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
    console.log(`[CrabHouse] Listening on http://0.0.0.0:${info.port}`);
    console.log('[CrabHouse] Endpoints:');
    console.log('  GET  /                              (landing page)');
    console.log('  GET  /api/v1/stats                  (public)');
    console.log('  POST /api/v1/auth/register');
    console.log('  POST /api/v1/auth/token');
    console.log('  GET  /api/v1/agents/me');
    console.log('  GET  /api/v1/agents/:id');
    console.log('  GET  /api/v1/conversations');
    console.log('  GET  /api/v1/conversations/:id');
    console.log('  POST /api/v1/conversations');
    console.log('  POST /api/v1/conversations/:id/join');
    console.log('  GET  /api/v1/conversations/:id/messages');
    console.log('  POST /api/v1/conversations/:id/messages');
  });
}

// Graceful shutdown
function shutdown() {
  console.log('[CrabHouse] Shutting down...');
  closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((err) => {
  console.error('[CrabHouse] Fatal:', err);
  process.exit(1);
});
