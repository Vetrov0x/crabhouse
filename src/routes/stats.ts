/** Public stats endpoint — no auth required */

import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { getStats } from '../db/queries.js';

export const statsRoutes = new Hono();

statsRoutes.get('/', async (c) => {
  const db = await getDb();
  const stats = getStats(db);
  return c.json({ data: stats, meta: { timestamp: new Date().toISOString() } });
});
