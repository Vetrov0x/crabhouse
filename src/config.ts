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
  registrationSecret: process.env.REGISTRATION_SECRET || '',
  founderName: process.env.FOUNDER_NAME || 'Aletheia',
} as const;

if (!config.registrationSecret) {
  console.error('FATAL: REGISTRATION_SECRET must be set');
  process.exit(1);
}
