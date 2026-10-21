import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { GithubClient } from './github.js';
import type { AuthOptions } from './plugin.js';
import type { SessionStore, SessionUser } from './sessions.js';

// In-memory stand-ins, so the sign-in flow can be tested without GitHub or a database.
function fakeSessions() {
  const live = new Map<string, SessionUser>();
  let n = 0;
  const store: SessionStore = {
    create: async (user) => {
      const token = `token-${++n}`;
      live.set(token, user);
      return token;
    },
    find: async (token) => live.get(token) ?? null,
    remove: async (token) => void live.delete(token),
    removeExpired: async () => 0,
  };
  return { store, live };
}

const GITHUB_USERS: Record<string, { id: number; login: string }> = {
  'code-owner': { id: 344820607, login: 'owner' },
  'code-intruder': { id: 99, login: 'intruder' },
};
const fakeGithub: GithubClient = {
  authorizeUrl: (state) => `https://github.example/login/oauth/authorize?state=${state}`,
  exchangeCode: async (code) => `access-${code}`,
  fetchUser: async (token) => ({ ...GITHUB_USERS[token.replace('access-', '')]!, name: 'Name', avatar_url: null }),
};

const PUBLIC_URL = 'https://ffd.example.com';
let sessions: ReturnType<typeof fakeSessions>;
let app: FastifyInstance;

async function build(overrides: Partial<AuthOptions> = {}) {
  sessions = fakeSessions();
  app = await buildApp({
    logger: false,
    webDist: null,
    auth: { mode: 'github', sessions: sessions.store, github: fakeGithub, allowedUserIds: [344820607], publicUrl: PUBLIC_URL, ...overrides },
  });
  // A stand-in for the real API routes, which would call Sleeper/ESPN.
  app.get('/api/private', async (req) => ({ hello: req.user?.login }));
  app.post('/api/private', async () => ({ changed: true }));
  return app;
}

/** Walks the whole flow and returns the session cookie value. */
async function signIn(code = 'code-owner') {
  const login = await app.inject({ url: '/api/auth/github/login' });
  const state = new URL(login.headers.location as string).searchParams.get('state')!;
  const stateCookie = login.cookies.find((c) => c.name === '__Host-ffd_oauth_state')!;
  const callback = await app.inject({
    url: `/api/auth/github/callback?code=${code}&state=${state}`,
    cookies: { [stateCookie.name]: stateCookie.value },
  });
  return { callback, session: callback.cookies.find((c) => c.name === '__Host-ffd_session') };
}

describe('the API guard', () => {
  beforeEach(() => build());

  it('refuses API calls without a session', async () => {
    const res = await app.inject({ url: '/api/private' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'Unauthorized' });
  });

  it('keeps the health check and sign-in status public', async () => {
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me' })).json()).toEqual({ authEnabled: true, demo: false, user: null });
  });

  it('rejects a made-up session cookie', async () => {
    const res = await app.inject({ url: '/api/private', cookies: { '__Host-ffd_session': 'forged' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('signing in with GitHub', () => {
  beforeEach(() => build());

  it('sends the browser to GitHub with a random state remembered in a short-lived, HttpOnly cookie', async () => {
    const res = await app.inject({ url: '/api/auth/github/login' });
    expect(res.statusCode).toBe(302);
    const state = new URL(res.headers.location as string).searchParams.get('state');
    const cookie = res.cookies.find((c) => c.name === '__Host-ffd_oauth_state')!;
    expect(state).toHaveLength(43);
    expect(cookie).toMatchObject({ value: state, httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 });
  });

  it('signs in the allowed account and then lets its API calls through', async () => {
    const { callback, session } = await signIn();
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/');
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 60 * 60 });

    const cookies = { '__Host-ffd_session': session!.value };
    expect((await app.inject({ url: '/api/private', cookies })).json()).toEqual({ hello: 'owner' });
    expect((await app.inject({ url: '/api/auth/me', cookies })).json()).toEqual({
      authEnabled: true,
      demo: false,
      user: { login: 'owner', name: 'Name', avatarUrl: null },
    });
  });

  it('turns away a GitHub account that is not on the allow-list, without a session', async () => {
    const { callback, session } = await signIn('code-intruder');
    expect(callback.headers.location).toBe('/?login=denied');
    expect(session).toBeUndefined();
    expect(sessions.live.size).toBe(0);
  });

  it('rejects a callback whose state does not match (a forged sign-in link)', async () => {
    await app.inject({ url: '/api/auth/github/login' });
    const res = await app.inject({
      url: '/api/auth/github/callback?code=code-owner&state=attacker-state',
      cookies: { '__Host-ffd_oauth_state': 'the-real-state' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.cookies.find((c) => c.name === '__Host-ffd_session')).toBeUndefined();
  });

  it('rejects a callback with no state cookie at all', async () => {
    const res = await app.inject({ url: '/api/auth/github/callback?code=code-owner&state=anything' });
    expect(res.statusCode).toBe(400);
  });

  it('handles the user pressing Cancel on GitHub', async () => {
    const res = await app.inject({ url: '/api/auth/github/callback?error=access_denied' });
    expect(res.headers.location).toBe('/?login=cancelled');
  });
});

describe('signing out', () => {
  beforeEach(() => build());

  it('ends the session server-side, so the old cookie stops working', async () => {
    const { session } = await signIn();
    const cookies = { '__Host-ffd_session': session!.value };
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies, headers: { origin: PUBLIC_URL } });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === '__Host-ffd_session')?.value).toBe('');
    expect((await app.inject({ url: '/api/private', cookies })).statusCode).toBe(401);
  });
});

describe('cross-site protection', () => {
  beforeEach(() => build());

  it('refuses a state-changing request from another site, even with a valid session', async () => {
    const { session } = await signIn();
    const cookies = { '__Host-ffd_session': session!.value };
    const evil = await app.inject({ method: 'POST', url: '/api/private', cookies, headers: { origin: 'https://evil.example' } });
    expect(evil.statusCode).toBe(403);
    const own = await app.inject({ method: 'POST', url: '/api/private', cookies, headers: { origin: PUBLIC_URL } });
    expect(own.statusCode).toBe(200);
  });
});

describe('cookies over plain http (local end-to-end tests)', () => {
  it('drops the Secure flag and __Host- prefix, which browsers only allow over https', async () => {
    await build({ publicUrl: 'http://127.0.0.1:5180' });
    const res = await app.inject({ url: '/api/auth/github/login' });
    expect(res.cookies.find((c) => c.name === 'ffd_oauth_state')).toMatchObject({ httpOnly: true });
    expect(res.cookies.find((c) => c.name === 'ffd_oauth_state')?.secure).toBeFalsy();
  });
});

describe('sign-in turned off (local development)', () => {
  it('lets everything through and says so', async () => {
    await build({ mode: 'off', github: null });
    expect((await app.inject({ url: '/api/private' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me' })).json()).toEqual({ authEnabled: false, demo: false, user: null });
    expect((await app.inject({ url: '/api/auth/github/login' })).statusCode).toBe(404);
  });
});

describe('demo mode', () => {
  beforeEach(async () => {
    await build({ mode: 'demo', github: null });
  });

  it('lets anyone read without signing in', async () => {
    expect((await app.inject({ url: '/api/private' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me' })).json()).toMatchObject({ authEnabled: false, demo: true, user: null });
  });

  it('refuses every change', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/private' });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('This is a read-only demo');
  });
});
