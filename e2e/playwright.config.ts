import { defineConfig, devices } from '@playwright/test';
import { API_PORT, apiEnv, e2eDir, OWNER_STATE, repoRoot, UPSTREAM_PORT, WEB_PORT } from './support/env.js';

const baseURL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: './tests',
  // Tests share one database and one running API, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI), // a stray test.only must not silently skip the suite in CI
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'sign-in', testMatch: /auth\.setup\.ts/ },
    // Starts every test signed in as the owner (page and API requests alike);
    // auth.spec.ts opts out to test signing in itself.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], storageState: OWNER_STATE }, dependencies: ['sign-in'] },
  ],

  // The whole stack, for real: fixtures server → API (+ Postgres) → production web build.
  webServer: [
    {
      command: 'npx tsx support/fake-upstream.ts',
      cwd: e2eDir,
      url: `http://127.0.0.1:${UPSTREAM_PORT}/sleeper/v1/state/nfl`,
      reuseExistingServer: false,
    },
    {
      command: 'npx tsx support/start-api.ts',
      cwd: e2eDir,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Builds and serves the production bundle, so the lazy-loaded History chunk is tested too.
      command: `npm run build -w @ffd/web && npm run preview -w @ffd/web -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: repoRoot,
      url: baseURL,
      env: { DEV_HTTP: '1', API_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
