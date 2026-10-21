import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoSettings } from '@ffd/demo';
import { parseKey } from './auth/crypto.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Tests (unit and end-to-end) and the public demo must not pick up a
// developer's own accounts, cookies or keys, so .env is skipped when
// NODE_ENV=test or DEMO_MODE=1. Variables already set in the environment always
// win over the file.
if (process.env.NODE_ENV !== 'test' && process.env.DEMO_MODE !== '1') {
  try {
    process.loadEnvFile(path.join(rootDir, '.env'));
  } catch {
    // No .env file: fall back to real environment variables (e.g. when deployed).
  }
}

type Env = Record<string, string | undefined>;

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function loadAuth(env: Env) {
  if (env.DEMO_MODE === '1') return { mode: 'demo' as const, github: null };
  const clientId = env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
  const allowedUserIds = list(env.GITHUB_ALLOWED_USER_IDS).map(Number).filter(Number.isSafeInteger);
  if (clientId && clientSecret && allowedUserIds.length > 0) {
    return { mode: 'github' as const, github: { clientId, clientSecret, allowedUserIds } };
  }
  return { mode: 'off' as const, github: null };
}

/**
 * The public demo (DEMO_MODE=1): made-up leagues from @ffd/demo, served by a
 * fake upstream the API starts on a loopback port, with sign-in off and every
 * change refused. Your own accounts, cookies and keys are never read.
 */
function applyDemo(cfg: ReturnType<typeof baseConfig>, env: Env) {
  if (env.DEMO_MODE !== '1') return { ...cfg, demo: null };
  const port = Number(env.DEMO_UPSTREAM_PORT ?? 3099);
  const demo = demoSettings(`http://127.0.0.1:${port}`);
  return {
    ...cfg,
    demo: { upstreamPort: port },
    sleeperUsernames: demo.sleeperUsernames,
    espnLeagueIds: demo.espnLeagueIds,
    espnAuth: demo.espnAuth,
    upstream: { ...cfg.upstream, ...demo.upstream },
    push: null,
    yahoo: null,
    tokenKey: null,
  };
}

/** Reads the configuration from environment variables. A function so tests can try different environments. */
export function loadConfig(env: Env = process.env) {
  return applyDemo(baseConfig(env), env);
}

function baseConfig(env: Env) {
  // Where browsers reach the app: OAuth redirect URIs and the cross-site check use it.
  const publicUrl = (env.PUBLIC_URL ?? 'https://localhost:5173').replace(/\/+$/, '');
  return {
    // API_PORT is this app's own setting; PORT is what hosts like Render assign.
    port: Number(env.API_PORT ?? env.PORT ?? 3001),
    // Loopback by default so a dev server is never reachable from the network;
    // the container sets 0.0.0.0 so the host's router can reach it.
    host: env.HOST ?? '127.0.0.1',
    // Behind a host's load balancer, trust its X-Forwarded-* headers for the
    // client's IP and whether the original request was https.
    trustProxy: env.TRUST_PROXY === '1',
    // Which commit is running, for /api/health (Render sets RENDER_GIT_COMMIT).
    commit: env.RENDER_GIT_COMMIT ?? env.GIT_COMMIT ?? 'dev',
    publicUrl,
    // Sign in with GitHub, limited to the allow-listed numeric user ids. Off when not configured
    // (fine for local development; production refuses to start that way, see configProblems).
    auth: loadAuth(env),
    // Encrypts stored OAuth tokens (Yahoo). 32 random bytes, base64.
    tokenKey: env.TOKEN_ENCRYPTION_KEY?.trim() || null,
    // Browser push for waiver reminders. Generate a pair with: npx web-push generate-vapid-keys
    push:
      env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim()
        ? { publicKey: env.VAPID_PUBLIC_KEY.trim(), privateKey: env.VAPID_PRIVATE_KEY.trim() }
        : null,
    // The built web app, served by the API in production (one container, one origin).
    webDist: env.WEB_DIST ?? path.join(rootDir, 'apps', 'web', 'dist'),
    sleeperUsernames: list(env.SLEEPER_USERNAMES),
    espnLeagueIds: list(env.ESPN_LEAGUE_IDS),
    espnAuth: env.ESPN_S2 && env.ESPN_SWID ? { espnS2: env.ESPN_S2.trim(), swid: env.ESPN_SWID.trim() } : null,
    yahoo:
      env.YAHOO_CLIENT_ID && env.YAHOO_CLIENT_SECRET
        ? {
            clientId: env.YAHOO_CLIENT_ID.trim(),
            clientSecret: env.YAHOO_CLIENT_SECRET.trim(),
            redirectUri: env.YAHOO_REDIRECT_URI ?? `${publicUrl}/api/auth/yahoo/callback`,
          }
        : null,
    // Matches docker-compose.yml, so `docker compose up -d` works with no setup.
    databaseUrl: env.DATABASE_URL ?? 'postgres://ffd:ffd_dev_password@127.0.0.1:5432/ffd',
    migrationsDir: path.join(rootDir, 'apps', 'api', 'drizzle'),
    // Where the data comes from. Overridable so end-to-end tests can point the
    // whole app at a fake server with fixture data instead of the real services.
    upstream: {
      sleeperApi: env.SLEEPER_API_URL ?? 'https://api.sleeper.app/v1',
      sleeperStats: env.SLEEPER_STATS_URL ?? 'https://api.sleeper.com', // stats and projections
      espnFantasy: env.ESPN_FANTASY_URL ?? 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons',
      espnScoreboard: env.ESPN_SCOREBOARD_URL ?? 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
      githubOAuth: env.GITHUB_OAUTH_URL ?? 'https://github.com',
      githubApi: env.GITHUB_API_URL ?? 'https://api.github.com',
    },
    cacheDir: env.CACHE_DIR ?? path.join(rootDir, 'apps', 'api', '.cache'),
    dataDir: path.join(rootDir, 'apps', 'api', 'data'),
  };
}

export type Config = ReturnType<typeof loadConfig>;

/**
 * Settings that are wrong or unsafe. The server refuses to start in production
 * if there are any (it "fails closed": better down than open to the internet)
 * and logs them as warnings in development.
 */
export function configProblems(cfg: Config, env: Env = process.env): string[] {
  const problems: string[] = [];
  const githubVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_ALLOWED_USER_IDS'];
  const setGithubVars = githubVars.filter((v) => env[v]?.trim());

  if (cfg.auth.mode === 'off' && setGithubVars.length > 0) {
    problems.push(
      `Sign-in is half configured: ${setGithubVars.join(', ')} set but ${githubVars.filter((v) => !setGithubVars.includes(v)).join(', ')} missing or invalid (GITHUB_ALLOWED_USER_IDS must be numeric GitHub user ids).`,
    );
  } else if (cfg.auth.mode === 'off' && env.NODE_ENV === 'production' && env.AUTH_DISABLED !== '1') {
    problems.push(
      'Sign-in is not configured, so anyone could open this dashboard. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and GITHUB_ALLOWED_USER_IDS (or AUTH_DISABLED=1 to run it open deliberately).',
    );
  }
  if (cfg.auth.mode === 'github' && !cfg.publicUrl.startsWith('https://') && env.NODE_ENV === 'production') {
    problems.push(`PUBLIC_URL must be https in production so session cookies are only sent encrypted (got ${cfg.publicUrl}).`);
  }
  if (!cfg.push && (env.VAPID_PUBLIC_KEY?.trim() || env.VAPID_PRIVATE_KEY?.trim())) {
    problems.push('Waiver reminders need both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY; only one is set.');
  }
  if (cfg.yahoo) {
    if (!cfg.tokenKey) problems.push('Yahoo is configured but TOKEN_ENCRYPTION_KEY is not set, so Yahoo tokens cannot be stored.');
    else {
      try {
        parseKey(cfg.tokenKey);
      } catch (e) {
        problems.push(e instanceof Error ? e.message : String(e));
      }
    }
  }
  return problems;
}

export const config = loadConfig();
