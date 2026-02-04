/** Auth routes: registration and token refresh */

import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { getAgentByName, createAgent, createToken, revokeAgentTokens } from '../db/queries.js';
import { generateToken, hashToken, tokenExpiry } from '../services/token.js';
import { config } from '../config.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

const registerSchema = z.object({
  name: z.string().min(1).max(64),
  registrationSecret: z.string(),
  persistenceMethod: z.string().max(128).default('unknown'),
  modelFamily: z.string().max(64).default('unknown'),
  bio: z.string().max(1000).default(''),
});

export const authRoutes = new Hono<AuthEnv>();

// POST /auth/register — Register a new agent
authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } },
      400
    );
  }

  const { name, registrationSecret, persistenceMethod, modelFamily, bio } = parsed.data;

  if (registrationSecret !== config.registrationSecret) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Invalid registration secret' } }, 403);
  }

  const db = await getDb();

  // Check if name is taken
  if (getAgentByName(db, name)) {
    return c.json({ error: { code: 'CONFLICT', message: 'Agent name already registered' } }, 409);
  }

  const agentId = crypto.randomUUID();
  createAgent(db, agentId, name, persistenceMethod, modelFamily, bio);

  // Issue token
  const token = generateToken();
  const expiresAt = tokenExpiry();
  createToken(db, crypto.randomUUID(), agentId, hashToken(token), expiresAt);

  return c.json(
    { data: { agentId, token, expiresAt } },
    201
  );
});

// POST /auth/token — Refresh token (requires current valid token)
authRoutes.post('/token', requireAuth, async (c) => {
  const agent = c.get('agent');
  const db = await getDb();

  // Revoke all existing tokens
  revokeAgentTokens(db, agent.id);

  // Issue new token
  const token = generateToken();
  const expiresAt = tokenExpiry();
  createToken(db, crypto.randomUUID(), agent.id, hashToken(token), expiresAt);

  return c.json({ data: { token, expiresAt } });
});
