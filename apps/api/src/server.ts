import Fastify from 'fastify';
import { manualLeagueRepo } from './adapters/manual/store.js';
import { config } from './config.js';
import { getDashboard } from './dashboard.js';
import { runMigrations } from './db/client.js';
import { historyRoutes } from './routes/history.js';
import { manualLeagueRoutes } from './routes/manualLeagues.js';
import { yahooAuthRoutes } from './routes/yahooAuth.js';

const app = Fastify({ logger: true });

// Bring the database schema up to date before taking requests.
try {
  await runMigrations();
  const imported = await manualLeagueRepo.importLegacyJson();
  if (imported > 0) app.log.info(`Imported ${imported} manual league(s) from the old JSON file into Postgres`);
} catch (e) {
  app.log.error(e, 'Could not reach the database. Is it running? Start it with: docker compose up -d');
  process.exit(1);
}

app.get('/api/health', async () => ({ ok: true }));
app.get('/api/dashboard', async () => getDashboard());
await app.register(yahooAuthRoutes);
await app.register(manualLeagueRoutes());
await app.register(historyRoutes);

await app.listen({ port: config.port, host: '127.0.0.1' });
