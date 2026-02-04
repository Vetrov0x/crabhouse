/** sql.js database connection with periodic persistence */

import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';

let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  try {
    const buffer = readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
  } catch {
    // DB doesn't exist yet — create new
    mkdirSync(dirname(config.dbPath), { recursive: true });
    db = new SQL.Database();
  }

  // Enable WAL-like behavior (best we can do with sql.js)
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  return db;
}

/** Mark DB as dirty — will be saved on next flush cycle */
export function markDirty() {
  dirty = true;
  if (!saveTimer) {
    saveTimer = setTimeout(flushToFile, 3000); // Save 3s after last write
  }
}

/** Flush in-memory DB to disk */
export function flushToFile() {
  if (!db || !dirty) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(config.dbPath, buffer);
    dirty = false;
    saveTimer = null;
  } catch (err) {
    console.error('[DB] Failed to save:', err);
  }
}

/** Graceful shutdown — save and close */
export function closeDb() {
  if (saveTimer) clearTimeout(saveTimer);
  flushToFile();
  if (db) {
    db.close();
    db = null;
  }
}
