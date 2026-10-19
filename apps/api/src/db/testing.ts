// Helpers for tests that need a real Postgres. Each run creates its own
// throwaway database, runs the migrations on it and drops it afterwards, so the
// tests never touch the data in your development database.

import crypto from 'node:crypto';
import pg from 'pg';
import { config } from '../config.js';
import { createDb, runMigrations } from './client.js';

const withDatabase = (url: string, name: string) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};

// Admin connection to the server's default "postgres" database.
const adminUrl = () => withDatabase(config.databaseUrl, 'postgres');

export async function dbAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: adminUrl(), connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

export async function createTestDb() {
  const name = `ffd_test_${crypto.randomBytes(4).toString('hex')}`; // generated, so safe to inline in SQL
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);

  const { pool, db } = createDb(withDatabase(config.databaseUrl, name));
  await runMigrations(db);

  return {
    db,
    // Simulates a database restart or failover: the server hangs up every connection to this database.
    async killConnections() {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [name]);
    },
    async drop() {
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
