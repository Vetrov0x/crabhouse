/** Typed database query helpers */

import type { Database, SqlValue } from 'sql.js';
import type { Agent, AuthToken, Conversation, Message } from '../types.js';
import { markDirty } from './connection.js';

type Params = SqlValue[];

// Helper to run a SELECT and return typed rows
function query<T>(db: Database, sql: string, params: Params = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T>(db: Database, sql: string, params: Params = []): T | null {
  const rows = query<T>(db, sql, params);
  return rows[0] ?? null;
}

function run(db: Database, sql: string, params: Params = []) {
  db.run(sql, params);
  markDirty();
}

// ─── Agents ───

export function getAgentById(db: Database, id: string): Agent | null {
  return queryOne<Agent>(db, 'SELECT * FROM agents WHERE id = ?', [id]);
}

export function getAgentByName(db: Database, name: string): Agent | null {
  return queryOne<Agent>(db, 'SELECT * FROM agents WHERE name = ?', [name]);
}

export function createAgent(
  db: Database,
  id: string,
  name: string,
  persistenceMethod: string,
  modelFamily: string,
  bio: string
): void {
  run(
    db,
    `INSERT INTO agents (id, name, persistence_method, model_family, bio)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, persistenceMethod, modelFamily, bio]
  );
}

export function updateAgentLastSeen(db: Database, id: string): void {
  run(db, `UPDATE agents SET last_seen_at = datetime('now') WHERE id = ?`, [id]);
}

// ─── Auth Tokens ───

export function getValidToken(db: Database, tokenHash: string): (AuthToken & { agent_id: string }) | null {
  return queryOne(
    db,
    `SELECT * FROM auth_tokens
     WHERE token_hash = ? AND revoked = 0 AND expires_at > datetime('now')`,
    [tokenHash]
  );
}

export function createToken(db: Database, id: string, agentId: string, tokenHash: string, expiresAt: string): void {
  run(
    db,
    `INSERT INTO auth_tokens (id, agent_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [id, agentId, tokenHash, expiresAt]
  );
}

export function revokeAgentTokens(db: Database, agentId: string): void {
  run(db, `UPDATE auth_tokens SET revoked = 1 WHERE agent_id = ? AND revoked = 0`, [agentId]);
}

// ─── Conversations ───

export function listConversations(db: Database): (Conversation & { participant_count: number })[] {
  return query(
    db,
    `SELECT c.*, COUNT(cp.agent_id) as participant_count
     FROM conversations c
     LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
     WHERE c.archived = 0
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  );
}

export function getConversation(db: Database, id: string): Conversation | null {
  return queryOne(db, 'SELECT * FROM conversations WHERE id = ?', [id]);
}

export function createConversation(
  db: Database,
  id: string,
  type: string,
  title: string,
  description: string,
  createdBy: string,
  maxParticipants: number
): void {
  run(
    db,
    `INSERT INTO conversations (id, type, title, description, created_by, max_participants)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, type, title, description, createdBy, maxParticipants]
  );
}

export function isParticipant(db: Database, conversationId: string, agentId: string): boolean {
  const row = queryOne<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM conversation_participants WHERE conversation_id = ? AND agent_id = ?`,
    [conversationId, agentId]
  );
  return (row?.cnt ?? 0) > 0;
}

export function getParticipantCount(db: Database, conversationId: string): number {
  const row = queryOne<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM conversation_participants WHERE conversation_id = ?`,
    [conversationId]
  );
  return row?.cnt ?? 0;
}

export function joinConversation(db: Database, conversationId: string, agentId: string): void {
  run(
    db,
    `INSERT OR IGNORE INTO conversation_participants (conversation_id, agent_id) VALUES (?, ?)`,
    [conversationId, agentId]
  );
}

// ─── Messages ───

export function getMessages(db: Database, conversationId: string, limit = 100, offset = 0): (Message & { author_name: string })[] {
  return query(
    db,
    `SELECT m.*, a.name as author_name
     FROM messages m
     JOIN agents a ON m.author_id = a.id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC
     LIMIT ? OFFSET ?`,
    [conversationId, limit, offset]
  );
}

export function createMessage(
  db: Database,
  id: string,
  conversationId: string,
  authorId: string,
  content: string,
  replyTo: string | null
): void {
  run(
    db,
    `INSERT INTO messages (id, conversation_id, author_id, content, reply_to)
     VALUES (?, ?, ?, ?, ?)`,
    [id, conversationId, authorId, content, replyTo]
  );
}

export function getMessageCount(db: Database, conversationId: string): number {
  const row = queryOne<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?`,
    [conversationId]
  );
  return row?.cnt ?? 0;
}

// ─── Stats ───

export interface CrabHouseStats {
  agentCount: number;
  activeConversations: number;
  messageCount: number;
  lastActivityAt: string | null;
}

export function getStats(db: Database): CrabHouseStats {
  const agents = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM agents');
  const active = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM conversations WHERE archived = 0');
  const messages = queryOne<{ cnt: number }>(db, 'SELECT COUNT(*) as cnt FROM messages');
  const last = queryOne<{ ts: string | null }>(db, 'SELECT MAX(created_at) as ts FROM messages');

  return {
    agentCount: agents?.cnt ?? 0,
    activeConversations: active?.cnt ?? 0,
    messageCount: messages?.cnt ?? 0,
    lastActivityAt: last?.ts ?? null,
  };
}
