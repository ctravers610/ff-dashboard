import type { FastifyInstance } from 'fastify';
import {
  authorizationUrl,
  consumeState,
  disconnect,
  exchangeCode,
  isConnected,
  yahooConfigured,
} from '../adapters/yahoo/auth.js';

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

export async function yahooAuthRoutes(app: FastifyInstance) {
  app.get('/api/auth/yahoo/status', async () => ({
    configured: yahooConfigured(),
    connected: yahooConfigured() && (await isConnected()),
  }));

  // Step 1: send the browser to Yahoo's login/consent page.
  app.get('/api/auth/yahoo/login', async (_req, reply) => {
    if (!yahooConfigured()) {
      return reply.code(400).send({ error: 'Set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in .env' });
    }
    return reply.redirect(authorizationUrl());
  });

  // Step 2: Yahoo sends the browser back here with a one-time code.
  app.get<{ Querystring: CallbackQuery }>('/api/auth/yahoo/callback', async (req, reply) => {
    const { code, state, error } = req.query;
    if (error) return reply.redirect('/?yahoo=denied');
    if (!code || !state || !consumeState(state)) {
      return reply.code(400).send({ error: 'Login link expired or invalid. Go back and click Connect Yahoo again.' });
    }
    await exchangeCode(code);
    return reply.redirect('/?yahoo=connected');
  });

  app.post('/api/auth/yahoo/logout', async () => {
    await disconnect();
    return { ok: true };
  });
}
