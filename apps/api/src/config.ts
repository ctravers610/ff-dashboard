import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  // No .env file: fall back to real environment variables (e.g. when deployed).
}

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.API_PORT ?? 3001),
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
  cacheDir: path.join(rootDir, 'apps', 'api', '.cache'),
  dataDir: path.join(rootDir, 'apps', 'api', 'data'),
};
