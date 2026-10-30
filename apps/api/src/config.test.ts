import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { configProblems, loadConfig } from './config.js';

const problemsFor = (env: Record<string, string>) => configProblems(loadConfig(env), env);
const github = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret', GITHUB_ALLOWED_USER_IDS: '344820607' };
const key = crypto.randomBytes(32).toString('base64');

describe('sign-in configuration', () => {
  it('turns sign-in on only when client id, secret and allowed ids are all set', () => {
    expect(loadConfig(github).auth).toEqual({
      mode: 'github',
      github: { clientId: 'id', clientSecret: 'secret', allowedUserIds: [344820607] },
    });
    expect(loadConfig({}).auth.mode).toBe('off');
  });

  it('is fine to run without sign-in in development', () => {
    expect(problemsFor({})).toEqual([]);
  });

  it('refuses production without sign-in, unless deliberately opened', () => {
    expect(problemsFor({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db/ffd' })).toEqual([expect.stringContaining('anyone could open this dashboard')]);
    expect(problemsFor({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db/ffd', AUTH_DISABLED: '1' })).toEqual([]);
  });

  it('flags half-finished sign-in setup in any environment, naming what is missing', () => {
    const [problem] = problemsFor({ GITHUB_CLIENT_ID: 'id' });
    expect(problem).toContain('GITHUB_CLIENT_ID set but GITHUB_CLIENT_SECRET, GITHUB_ALLOWED_USER_IDS missing');
  });

  it('treats a username in the allow-list as a mistake: ids are numbers', () => {
    expect(loadConfig({ ...github, GITHUB_ALLOWED_USER_IDS: 'ctravers610' }).auth.mode).toBe('off');
    expect(problemsFor({ ...github, GITHUB_ALLOWED_USER_IDS: 'ctravers610' })[0]).toContain('must be numeric');
  });

  it('requires https in production when sign-in is on', () => {
    const prod = { ...github, NODE_ENV: 'production', DATABASE_URL: 'postgres://db/ffd' };
    expect(problemsFor({ ...prod, PUBLIC_URL: 'http://example.com' })[0]).toContain('must be https');
    expect(problemsFor({ ...prod, PUBLIC_URL: 'https://example.com' })).toEqual([]);
  });
});

describe('Yahoo token encryption', () => {
  const yahoo = { YAHOO_CLIENT_ID: 'y', YAHOO_CLIENT_SECRET: 's' };

  it('needs a valid TOKEN_ENCRYPTION_KEY when Yahoo is configured', () => {
    expect(problemsFor(yahoo)[0]).toContain('TOKEN_ENCRYPTION_KEY is not set');
    expect(problemsFor({ ...yahoo, TOKEN_ENCRYPTION_KEY: 'short' })[0]).toContain('32 bytes');
    expect(problemsFor({ ...yahoo, TOKEN_ENCRYPTION_KEY: key })).toEqual([]);
  });
});

describe('derived settings', () => {
  it('builds the Yahoo redirect from PUBLIC_URL, ignoring a trailing slash', () => {
    const cfg = loadConfig({ YAHOO_CLIENT_ID: 'y', YAHOO_CLIENT_SECRET: 's', PUBLIC_URL: 'https://ffd.example.com/' });
    expect(cfg.publicUrl).toBe('https://ffd.example.com');
    expect(cfg.yahoo?.redirectUri).toBe('https://ffd.example.com/api/auth/yahoo/callback');
  });
});

describe('demo mode', () => {
  const env = { DEMO_MODE: '1', NODE_ENV: 'production', DEMO_UPSTREAM_PORT: '3099', DATABASE_URL: 'postgres://db/ffd_demo' };

  it('follows the made-up leagues on the built-in fake upstream, never your own accounts', () => {
    const cfg = loadConfig({ ...env, SLEEPER_USERNAMES: 'me', ESPN_S2: 'real-cookie', ESPN_SWID: '{REAL}', YAHOO_COOKIE: 'real-cookie', VAPID_PUBLIC_KEY: 'k', VAPID_PRIVATE_KEY: 'k' });
    expect(cfg.yahooCookie).toBeNull();
    expect(cfg.demo).toEqual({ upstreamPort: 3099 });
    expect(cfg.auth.mode).toBe('demo');
    expect(cfg.sleeperUsernames).not.toContain('me');
    expect(cfg.espnAuth?.espnS2).not.toBe('real-cookie');
    expect(cfg.upstream.sleeperApi).toBe('http://127.0.0.1:3099/sleeper/v1');
    expect(cfg.push).toBeNull();
  });

  it('is allowed to run in production without sign-in', () => {
    expect(configProblems(loadConfig(env), env)).toEqual([]);
  });
});

describe('database', () => {
  it('requires DATABASE_URL in production, instead of falling back to the local default', () => {
    expect(problemsFor({ NODE_ENV: 'production', DEMO_MODE: '1' })).toEqual([
      'DATABASE_URL is not set, so there is no database to use (the local default only works on a development machine).',
    ]);
    expect(problemsFor({ NODE_ENV: 'production', DEMO_MODE: '1', DATABASE_URL: 'postgres://db/ffd' })).toEqual([]);
    expect(problemsFor({})).toEqual([]); // development: the local default is fine
  });
});
