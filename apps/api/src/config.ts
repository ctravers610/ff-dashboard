import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Tests (unit and end-to-end) must not pick up a developer's own accounts,
// cookies or keys, so .env is skipped when NODE_ENV=test. Variables already set
// in the environment always win over the file.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile(path.join(rootDir, '.env'));
  } catch {
    // No .env file: fall back to real environment variables (e.g. when deployed).
  }
}

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  // API_PORT is this app's own setting; PORT is what hosts like Render assign.
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 3001),
  // Loopback by default so a dev server is never reachable from the network;
  // the container sets 0.0.0.0 so the host's router can reach it.
  host: process.env.HOST ?? '127.0.0.1',
  // Behind a host's load balancer, trust its X-Forwarded-* headers for the
  // client's IP and whether the original request was https.
  trustProxy: process.env.TRUST_PROXY === '1',
  // Which commit is running, for /api/health (Render sets RENDER_GIT_COMMIT).
  commit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? 'dev',
  // The built web app, served by the API in production (one container, one origin).
  webDist: process.env.WEB_DIST ?? path.join(rootDir, 'apps', 'web', 'dist'),
  sleeperUsernames: list(process.env.SLEEPER_USERNAMES),
  espnLeagueIds: list(process.env.ESPN_LEAGUE_IDS),
  espnAuth:
    process.env.ESPN_S2 && process.env.ESPN_SWID
      ? { espnS2: process.env.ESPN_S2.trim(), swid: process.env.ESPN_SWID.trim() }
      : null,
  yahoo:
    process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET
      ? {
          clientId: process.env.YAHOO_CLIENT_ID.trim(),
          clientSecret: process.env.YAHOO_CLIENT_SECRET.trim(),
          redirectUri:
            process.env.YAHOO_REDIRECT_URI ?? 'https://localhost:5173/api/auth/yahoo/callback',
        }
      : null,
  // Matches docker-compose.yml, so `docker compose up -d` works with no setup.
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ffd:ffd_dev_password@127.0.0.1:5432/ffd',
  migrationsDir: path.join(rootDir, 'apps', 'api', 'drizzle'),
  // Where the data comes from. Overridable so end-to-end tests can point the
  // whole app at a fake server with fixture data instead of the real services.
  upstream: {
    sleeperApi: process.env.SLEEPER_API_URL ?? 'https://api.sleeper.app/v1',
    sleeperStats: process.env.SLEEPER_STATS_URL ?? 'https://api.sleeper.com', // stats and projections
    espnFantasy: process.env.ESPN_FANTASY_URL ?? 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons',
    espnScoreboard:
      process.env.ESPN_SCOREBOARD_URL ?? 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  },
  cacheDir: process.env.CACHE_DIR ?? path.join(rootDir, 'apps', 'api', '.cache'),
  dataDir: path.join(rootDir, 'apps', 'api', 'data'),
};
