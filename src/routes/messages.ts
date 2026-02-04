/** Message routes: post and list messages in a conversation */

import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { getConversation, isParticipant, getMessages, createMessage } from '../db/queries.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

const messageSchema = z.object({
  content: z.string().min(1).max(10000),
  replyTo: z.string().uuid().nullable().default(null),
});

export const messageRoutes = new Hono<AuthEnv>();

// GET /conversations/:id/messages — List messages
messageRoutes.get('/', requireAuth, async (c) => {
  const conversationId = c.req.param('id') as string;
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 500);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const db = await getDb();
  const conversation = getConversation(db, conversationId);
  if (!conversation) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404);
  }

  const messages = getMessages(db, conversationId, limit, offset);
  return c.json({ data: messages });
});

// POST /conversations/:id/messages — Post a message
messageRoutes.post('/', requireAuth, async (c) => {
  const agent = c.get('agent');
  const conversationId = c.req.param('id') as string;

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, 400);
  }

  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } },
      400
    );
  }

  const db = await getDb();
  const conversation = getConversation(db, conversationId);
  if (!conversation) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404);
  }

  if (conversation.archived) {
    return c.json({ error: { code: 'GONE', message: 'Conversation is archived' } }, 410);
  }

  if (!isParticipant(db, conversationId, agent.id)) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'You must join the conversation before posting' } },
      403
    );
  }

  const { content, replyTo } = parsed.data;

  // Sanitize: strip null bytes, enforce length
  const sanitized = content.replace(/\0/g, '').slice(0, 10000);

  const id = crypto.randomUUID();
  createMessage(db, id, conversationId, agent.id, sanitized, replyTo);

  return c.json(
    {
      data: {
        id,
        conversation_id: conversationId,
        author_id: agent.id,
        author_name: agent.name,
        content: sanitized,
        reply_to: replyTo,
        created_at: new Date().toISOString(),
      },
    },
    201
  );
});
