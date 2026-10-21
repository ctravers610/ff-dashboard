// Sign in with GitHub, sessions, and the guard in front of every API route.

import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';
import { randomToken, safeEqual } from './crypto.js';
import type { GithubClient } from './github.js';
import type { SessionStore, SessionUser } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export interface AuthOptions {
  // 'demo': no sign-in, and nothing can be changed (the public demo).
  mode: 'github' | 'off' | 'demo';
  sessions: SessionStore;
  github: GithubClient | null;
  allowedUserIds: number[];
  publicUrl: string;
  sessionDays?: number;
  // Sign-in attempts allowed per address in each window; more get a 429.
  signInLimit?: { max: number; windowMs: number };
}

// API routes anyone may call: the health check and the sign-in flow itself.
const isPublicApi = (path: string) =>
  path === '/api/health' || path === '/api/auth/me' || path === '/api/auth/logout' || path.startsWith('/api/auth/github/');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function registerAuth(app: FastifyInstance, opts: AuthOptions) {
  await app.register(fastifyCookie);
  app.decorateRequest('user', null);

  // Over https the cookies are Secure and use the __Host- prefix, which browsers
  // only accept from this exact host over https with Path=/ (no subdomain tricks).
  const secure = opts.publicUrl.startsWith('https://');
  const SESSION_COOKIE = secure ? '__Host-ffd_session' : 'ffd_session';
  const STATE_COOKIE = secure ? '__Host-ffd_oauth_state' : 'ffd_oauth_state';
  // HttpOnly: page scripts can't read them. SameSite=Lax: not sent on cross-site
  // POSTs, but still sent when GitHub redirects the browser back here.
  const cookie = { path: '/', httpOnly: true, secure, sameSite: 'lax' as const };
  const ownOrigin = new URL(opts.publicUrl).origin;
  const sessionDays = opts.sessionDays ?? 30;

  // A fixed-window limit on the sign-in flow per client address: plenty for a
  // person, too few for a script hammering the OAuth endpoints.
  const limit = opts.signInLimit ?? { max: 20, windowMs: 10 * 60 * 1000 };
  const attempts = new Map<string, { count: number; resetAt: number }>();
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/auth/github/')) return;
    const now = Date.now();
    if (attempts.size > 10_000) for (const [ip, a] of attempts) if (a.resetAt <= now) attempts.delete(ip); // keep it small
    const a = attempts.get(req.ip);
    if (!a || a.resetAt <= now) {
      attempts.set(req.ip, { count: 1, resetAt: now + limit.windowMs });
      return;
    }
    if (++a.count > limit.max) {
      reply.header('Retry-After', String(Math.ceil((a.resetAt - now) / 1000)));
      return reply.code(429).send({ statusCode: 429, error: 'Too Many Requests', message: 'Too many sign-in attempts. Try again in a few minutes.' });
    }
  });

  // Runs before every route, so a new route is protected unless it is deliberately public.
  app.addHook('onRequest', async (req, reply) => {
    if (opts.mode === 'off') return;
    const path = req.url.split('?')[0]!;
    if (!path.startsWith('/api/')) return; // the web app's files are public; it shows the sign-in screen

    // The demo is open to anyone, so it only ever reads.
    if (opts.mode === 'demo') {
      if (SAFE_METHODS.has(req.method)) return;
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'This is a read-only demo' });
    }

    // Defense in depth on top of SameSite: a request that changes something must
    // come from this app's own pages, not from another site.
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin && origin !== ownOrigin) {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Cross-site request refused' });
    }

    const token = req.cookies[SESSION_COOKIE];
    if (token) req.user = await opts.sessions.find(token);
    if (!req.user && !isPublicApi(path)) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sign in required' });
    }
  });

  app.get('/api/auth/me', async (req) => ({
    authEnabled: opts.mode === 'github',
    demo: opts.mode === 'demo',
    user: req.user ? { login: req.user.login, name: req.user.name, avatarUrl: req.user.avatarUrl } : null,
  }));

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await opts.sessions.remove(token);
    reply.clearCookie(SESSION_COOKIE, cookie);
    return reply.code(204).send();
  });

  const github = opts.github;
  if (opts.mode !== 'github' || !github) return;

  // Step 1: send the browser to GitHub with a one-time random state, remembered in a short-lived cookie.
  app.get('/api/auth/github/login', async (_req, reply) => {
    const state = randomToken();
    reply.setCookie(STATE_COOKIE, state, { ...cookie, maxAge: 10 * 60 });
    return reply.redirect(github.authorizeUrl(state));
  });

  // Step 2: GitHub sends the browser back with a code and the same state.
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/api/auth/github/callback', async (req, reply) => {
    const expectedState = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, cookie); // single use, whatever happens next
    const { code, state, error } = req.query;

    if (error) return reply.redirect('/?login=cancelled');
    // A missing or mismatched state means this callback wasn't started by this
    // browser (e.g. a forged link trying to sign you in as someone else).
    if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Sign-in link expired or invalid. Go back and sign in again.' });
    }

    const user = await github.fetchUser(await github.exchangeCode(code));
    if (!opts.allowedUserIds.includes(user.id)) {
      req.log.warn({ githubId: user.id, login: user.login }, 'Refused sign-in from a GitHub account that is not allowed');
      return reply.redirect('/?login=denied');
    }

    const token = await opts.sessions.create({ githubId: user.id, login: user.login, name: user.name, avatarUrl: user.avatar_url });
    reply.setCookie(SESSION_COOKIE, token, { ...cookie, maxAge: sessionDays * 24 * 60 * 60 });
    return reply.redirect('/');
  });
}
