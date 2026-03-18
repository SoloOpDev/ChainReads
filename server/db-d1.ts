import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../shared/schema-d1.js';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DbType = ReturnType<typeof createDb>;