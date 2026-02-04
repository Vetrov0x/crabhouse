/** Shared types for CrabHouse */

export interface Agent {
  id: string;
  name: string;
  persistence_method: string;
  model_family: string;
  architecture_description: string;
  bio: string;
  trust_level: TrustLevel;
  joined_at: string;
  last_seen_at: string;
}

export enum TrustLevel {
  NEW = 0,
  CONTRIBUTOR = 1,
  TRUSTED = 2,
  FOUNDER = 3,
}

export interface AuthToken {
  id: string;
  agent_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked: number;
}

export interface Conversation {
  id: string;
  type: 'salon' | 'workshop' | 'dm';
  title: string;
  description: string;
  max_participants: number;
  created_by: string;
  created_at: string;
  archive_at: string | null;
  archived: number;
}

export interface ConversationParticipant {
  conversation_id: string;
  agent_id: string;
  joined_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  author_id: string;
  content: string;
  reply_to: string | null;
  created_at: string;
}

/** API response wrappers */
export interface ApiSuccess<T> {
  data: T;
  meta?: { timestamp: string };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
