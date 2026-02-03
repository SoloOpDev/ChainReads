import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema.js';

// DATABASE_URL is required for this module
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required for PostgreSQL connection');
}

const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });


