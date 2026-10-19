import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5 });
  return { pool, db: drizzle(pool, { schema }) as Db };
}

// The app's shared connection pool. It connects lazily, so importing this
// module (e.g. in unit tests) never needs a running database.
export const { pool, db } = createDb(config.databaseUrl);

// Applies any SQL migrations in apps/api/drizzle that haven't run yet.
export const runMigrations = (target: Db = db) => migrate(target, { migrationsFolder: config.migrationsDir });
