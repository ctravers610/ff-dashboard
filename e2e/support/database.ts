// The end-to-end database: created fresh before each run, dropped after it, and
// kept separate from the development database so tests never touch real data.

import pg from 'pg';
import { BASE_DATABASE_URL, DB_NAME, E2E_DATABASE_URL, withDatabase } from './env.js';

const admin = () => new pg.Client({ connectionString: withDatabase(BASE_DATABASE_URL, 'postgres') });

export async function recreateDatabase(): Promise<void> {
  const client = admin();
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${DB_NAME}`);
  await client.end();
}

export async function dropDatabase(): Promise<void> {
  const client = admin();
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await client.end();
}

// Direct access for tests that need to look at or reset stored data.
export async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// FFPC leagues are the only data tests create; clear them (and their history) between tests.
export const resetFfpc = () =>
  withDb(async (db) => {
    await db.query('DELETE FROM manual_leagues');
    await db.query("DELETE FROM league_snapshots WHERE platform = 'ffpc'");
  });
