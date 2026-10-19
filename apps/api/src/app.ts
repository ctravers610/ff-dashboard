// Builds the Fastify app: routes, and in production the web app too. Kept
// separate from server.ts (which migrates and listens) so tests can build an app
// and send it requests with inject(), no network or database needed.

import fastifyStatic from '@fastify/static';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { githubClient } from './auth/github.js';
import { registerAuth, type AuthOptions } from './auth/plugin.js';
import { sessionStore } from './auth/sessions.js';
import { config } from './config.js';
import { getDashboard } from './dashboard.js';
import { db, type Db } from './db/client.js';
import { historyRoutes } from './routes/history.js';
import { getWaivers } from './waivers/index.js';
import { reminderRoutes } from './reminders/routes.js';
import { sourceRoutes } from './sources/routes.js';
import { manualLeagueRoutes } from './routes/manualLeagues.js';
import { yahooAuthRoutes } from './routes/yahooAuth.js';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  /** Folder with the built web app; null serves only the API. */
  webDist?: string | null;
  /** Sign-in setup; defaults to the configuration. Tests pass fakes. */
  auth?: AuthOptions;
  /** The database the deep health check queries; defaults to the shared pool. */
  database?: Db;
}

function authFromConfig(): AuthOptions {
  const gh = config.auth.github;
  return {
    mode: config.auth.mode,
    sessions: sessionStore(db),
    github: gh
      ? githubClient({
          clientId: gh.clientId,
          clientSecret: gh.clientSecret,
          redirectUri: `${config.publicUrl}/api/auth/github/callback`,
          oauthUrl: config.upstream.githubOAuth,
          apiUrl: config.upstream.githubApi,
        })
      : null,
    allowedUserIds: gh?.allowedUserIds ?? [],
    publicUrl: config.publicUrl,
  };
}

export async function buildApp({ logger = true, webDist = config.webDist, auth, database = db }: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: config.trustProxy });
  const startedAt = new Date().toISOString();

  // First, so every route registered after it is behind sign-in unless deliberately public.
  await registerAuth(app, auth ?? authFromConfig());

  // The host's health check calls this often, so by default it doesn't touch the
  // database (a serverless Postgres would never get to sleep). ?deep=1 also proves
  // the database is reachable and migrated; the smoke test uses that after a deploy.
  app.get<{ Querystring: { deep?: string } }>('/api/health', async (req, reply) => {
    const base = { ok: true, commit: config.commit, startedAt };
    if (req.query.deep !== '1') return base;
    try {
      await database.execute(sql`SELECT 1 FROM sessions LIMIT 1`); // the newest table: there only once migrations ran
      return { ...base, database: 'ok' };
    } catch (e) {
      req.log.error(e, 'Deep health check: database unavailable');
      return reply.code(503).send({ ...base, ok: false, database: 'unavailable' });
    }
  });
  app.get('/api/dashboard', async () => getDashboard());
  app.get('/api/waivers', async () => getWaivers());
  await app.register(yahooAuthRoutes);
  await app.register(manualLeagueRoutes());
  await app.register(historyRoutes);
  await app.register(reminderRoutes());
  await app.register(sourceRoutes());

  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) await serveWeb(app, webDist);
  return app;
}

async function serveWeb(app: FastifyInstance, root: string) {
  await app.register(fastifyStatic, {
    root,
    // Vite fingerprints every file in /assets (the name changes when the content
    // does), so those can be cached for a year. index.html must be re-checked on
    // every visit so a new deploy is picked up straight away.
    setHeaders(reply, filePath) {
      const fingerprinted = filePath.includes(`${path.sep}assets${path.sep}`);
      reply.header('Cache-Control', fingerprinted ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });

  // A page address with no file behind it (a bookmarked client-side route) gets
  // the app itself; unknown API paths still get a JSON 404, never HTML.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Route ${req.method}:${req.url} not found` });
  });
}
