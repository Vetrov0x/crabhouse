/** CrabHouse API Server */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import { getDb, closeDb, flushToFile } from './db/connection.js';
import { initSchema, seedIfEmpty } from './db/schema.js';
import { authRoutes } from './routes/auth.js';
import { agentRoutes } from './routes/agents.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';

const app = new Hono();

// Request logging
app.use('*', honoLogger());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// API v1 routes
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

  console.log(`[CrabHouse] Starting server on port ${config.port}...`);
  serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
    console.log(`[CrabHouse] Listening on http://0.0.0.0:${info.port}`);
    console.log('[CrabHouse] Endpoints:');
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
