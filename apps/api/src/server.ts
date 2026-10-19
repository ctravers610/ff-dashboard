// Starts the API: bring the database up to date, then listen.

import { manualLeagueRepo } from './adapters/manual/store.js';
import { buildApp } from './app.js';
import { config } from './config.js';
import { pool, runMigrations } from './db/client.js';

const app = await buildApp();

// Bring the database schema up to date before taking requests.
try {
  await runMigrations();
  const imported = await manualLeagueRepo.importLegacyJson();
  if (imported > 0) app.log.info(`Imported ${imported} manual league(s) from the old JSON file into Postgres`);
} catch (e) {
  app.log.error(e, 'Could not reach the database. Is it running? Start it with: docker compose up -d');
  process.exit(1);
}

// Hosts stop the old instance with SIGTERM on every deploy (and Ctrl+C sends
// SIGINT): stop accepting requests, let in-flight ones finish, close the pool.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
