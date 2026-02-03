import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../shared/schema.js';

// DATABASE_URL is required for this module
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required for PostgreSQL connection');
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });


