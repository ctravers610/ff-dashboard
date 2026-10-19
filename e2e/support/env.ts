// Ports, URLs and environment shared by the Playwright config and the test helpers.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESPN_FAILING_LEAGUE_ID, ESPN_LEAGUE_ID, ESPN_S2, ESPN_SWID } from '../fixtures/espn.js';
import { SLEEPER_USERNAME } from '../fixtures/sleeper.js';

export const e2eDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(e2eDir, '..');

export const UPSTREAM_PORT = 4010;
export const API_PORT = 3002;
export const WEB_PORT = 5180;
export const DB_NAME = 'ffd_e2e';

// The same server credentials as docker-compose.yml and CI; only the database differs.
export const BASE_DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://ffd:ffd_dev_password@127.0.0.1:5432/ffd';
export const withDatabase = (url: string, name: string) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};
export const E2E_DATABASE_URL = withDatabase(BASE_DATABASE_URL, DB_NAME);

const up = `http://127.0.0.1:${UPSTREAM_PORT}`;

// Every variable the API reads is set explicitly, so nothing from a developer's
// own .env (accounts, cookies, Yahoo keys) can leak into a test run.
export const apiEnv: Record<string, string> = {
  NODE_ENV: 'test', // also tells the API not to load .env
  API_PORT: String(API_PORT),
  DATABASE_URL: E2E_DATABASE_URL,
  SLEEPER_USERNAMES: SLEEPER_USERNAME,
  ESPN_LEAGUE_IDS: `${ESPN_LEAGUE_ID},${ESPN_FAILING_LEAGUE_ID}`,
  ESPN_S2,
  ESPN_SWID,
  YAHOO_CLIENT_ID: '',
  YAHOO_CLIENT_SECRET: '',
  SLEEPER_API_URL: `${up}/sleeper/v1`,
  SLEEPER_STATS_URL: `${up}/sleeper-stats`,
  ESPN_FANTASY_URL: `${up}/espn/fantasy`,
  ESPN_SCOREBOARD_URL: `${up}/espn/scoreboard`,
  CACHE_DIR: path.join(e2eDir, '.tmp', 'cache'),
};
