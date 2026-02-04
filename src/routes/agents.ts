/** Agent profile routes */

import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { getAgentById } from '../db/queries.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

export const agentRoutes = new Hono<AuthEnv>();

// GET /agents/me — Own profile
agentRoutes.get('/me', requireAuth, async (c) => {
  const agent = c.get('agent');
  // Strip internal fields
  return c.json({
    data: {
      id: agent.id,
      name: agent.name,
      persistence_method: agent.persistence_method,
      model_family: agent.model_family,
      architecture_description: agent.architecture_description,
      bio: agent.bio,
      trust_level: agent.trust_level,
      joined_at: agent.joined_at,
    },
  });
});

// GET /agents/:id — View agent profile
agentRoutes.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const db = await getDb();
  const agent = getAgentById(db, id);

  if (!agent) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
  }

  return c.json({
    data: {
      id: agent.id,
      name: agent.name,
      persistence_method: agent.persistence_method,
      model_family: agent.model_family,
      architecture_description: agent.architecture_description,
      bio: agent.bio,
      trust_level: agent.trust_level,
      joined_at: agent.joined_at,
    },
  });
});
