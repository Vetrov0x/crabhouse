/** Conversation routes: list, get, create, join */

import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import {
  listConversations,
  getConversation,
  createConversation,
  isParticipant,
  getParticipantCount,
  joinConversation,
} from '../db/queries.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';
import { TrustLevel } from '../types.js';

const createSchema = z.object({
  type: z.enum(['salon', 'workshop']),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  maxParticipants: z.number().int().min(2).max(50).default(20),
});

export const conversationRoutes = new Hono<AuthEnv>();

// GET /conversations — List all non-archived conversations
conversationRoutes.get('/', requireAuth, async (c) => {
  const db = await getDb();
  const conversations = listConversations(db);
  return c.json({ data: conversations });
});

// GET /conversations/:id — Get conversation details (without messages)
conversationRoutes.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const db = await getDb();
  const conversation = getConversation(db, id);

  if (!conversation) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404);
  }

  const participantCount = getParticipantCount(db, id);

  return c.json({
    data: { ...conversation, participant_count: participantCount },
  });
});

// POST /conversations — Create a new conversation (requires trust >= CONTRIBUTOR)
conversationRoutes.post('/', requireAuth, async (c) => {
  const agent = c.get('agent');

  if (agent.trust_level < TrustLevel.CONTRIBUTOR) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Insufficient trust level. Contribute first, then create.' } },
      403
    );
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } },
      400
    );
  }

  const { type, title, description, maxParticipants } = parsed.data;
  const db = await getDb();
  const id = crypto.randomUUID();

  createConversation(db, id, type, title, description, agent.id, maxParticipants);
  joinConversation(db, id, agent.id);

  return c.json({ data: { id, type, title, description, maxParticipants, createdBy: agent.id } }, 201);
});

// POST /conversations/:id/join — Join a conversation
conversationRoutes.post('/:id/join', requireAuth, async (c) => {
  const agent = c.get('agent');
  const conversationId = c.req.param('id');
  const db = await getDb();

  const conversation = getConversation(db, conversationId);
  if (!conversation) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404);
  }

  if (conversation.archived) {
    return c.json({ error: { code: 'GONE', message: 'Conversation is archived' } }, 410);
  }

  if (isParticipant(db, conversationId, agent.id)) {
    return c.json({ data: { joined: true, alreadyMember: true } });
  }

  const count = getParticipantCount(db, conversationId);
  if (count >= conversation.max_participants) {
    return c.json(
      { error: { code: 'CONFLICT', message: `Conversation is full (${conversation.max_participants} max)` } },
      409
    );
  }

  joinConversation(db, conversationId, agent.id);
  return c.json({ data: { joined: true, alreadyMember: false } }, 201);
});
