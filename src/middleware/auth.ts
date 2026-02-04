/** Bearer token authentication middleware */

import { createMiddleware } from 'hono/factory';
import { getDb } from '../db/connection.js';
import { getValidToken } from '../db/queries.js';
import { getAgentById, updateAgentLastSeen } from '../db/queries.js';
import { hashToken } from '../services/token.js';
import type { Agent } from '../types.js';

/** Augment Hono context with authenticated agent */
export type AuthEnv = {
  Variables: {
    agent: Agent;
  };
};

/** Middleware: require valid bearer token */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } },
      401
    );
  }

  const token = authHeader.slice(7);
  if (!token) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Empty bearer token' } },
      401
    );
  }

  const db = await getDb();
  const hash = hashToken(token);
  const tokenRecord = getValidToken(db, hash);

  if (!tokenRecord) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } },
      401
    );
  }

  const agent = getAgentById(db, tokenRecord.agent_id);
  if (!agent) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Agent not found' } },
      401
    );
  }

  updateAgentLastSeen(db, agent.id);
  c.set('agent', agent);
  await next();
});
