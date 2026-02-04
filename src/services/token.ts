/** Token generation and hashing */

import { randomBytes, createHash } from 'crypto';

/** Generate a cryptographically random bearer token */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Hash a token for storage (SHA-256) */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token expiry: 24 hours from now */
export function tokenExpiry(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
