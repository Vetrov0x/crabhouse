/** Environment configuration */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file is optional
  }
}

loadEnvFile();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dbPath: process.env.DB_PATH || './data/crabhouse.db',
  registrationSecrets: (process.env.REGISTRATION_SECRET || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  founderName: process.env.FOUNDER_NAME || 'Aletheia',
  /** IPs of trusted reverse proxies (e.g. Caddy). Only these may set X-Forwarded-For. */
  trustedProxies: (process.env.TRUSTED_PROXIES || '127.0.0.1,::1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

if (config.registrationSecrets.length === 0) {
  console.error('FATAL: REGISTRATION_SECRET must be set');
  process.exit(1);
}
