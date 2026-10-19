// Builds the Fastify app: routes, and in production the web app too. Kept
// separate from server.ts (which migrates and listens) so tests can build an app
// and send it requests with inject(), no network or database needed.

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getDashboard } from './dashboard.js';
import { historyRoutes } from './routes/history.js';
import { manualLeagueRoutes } from './routes/manualLeagues.js';
import { yahooAuthRoutes } from './routes/yahooAuth.js';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  /** Folder with the built web app; null serves only the API. */
  webDist?: string | null;
}

export async function buildApp({ logger = true, webDist = config.webDist }: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: config.trustProxy });
  const startedAt = new Date().toISOString();

  app.get('/api/health', async () => ({ ok: true, commit: config.commit, startedAt }));
  app.get('/api/dashboard', async () => getDashboard());
  await app.register(yahooAuthRoutes);
  await app.register(manualLeagueRoutes());
  await app.register(historyRoutes);

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
