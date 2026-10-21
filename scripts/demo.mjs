// `npm run demo`: the public demo on this computer, at http://localhost:8090.
// Builds the web app, makes sure the demo's own database exists (next to your
// real one, in the same local Postgres), then runs the API in demo mode, which
// serves the web app too. Your .env is not read.

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.DEMO_PORT ?? '8090';
const SERVER_URL = process.env.DATABASE_URL ?? 'postgres://ffd:ffd_dev_password@127.0.0.1:5432/ffd';
const demoUrl = new URL(SERVER_URL);
demoUrl.pathname = '/ffd_demo';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const built = spawnSync(npm, ['run', 'build', '-w', '@ffd/web'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (built.status !== 0) process.exit(built.status ?? 1);

const admin = new pg.Client({ connectionString: SERVER_URL });
try {
  await admin.connect();
} catch {
  console.error('Could not reach Postgres. Start it with: docker compose up -d');
  process.exit(1);
}
const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'ffd_demo'");
if (!rowCount) await admin.query('CREATE DATABASE ffd_demo');
await admin.end();

console.log(`\nDemo at http://localhost:${PORT}\n`);
const api = spawn('npx', ['tsx', 'apps/api/src/server.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    DEMO_MODE: '1',
    API_PORT: PORT,
    PUBLIC_URL: `http://localhost:${PORT}`,
    DATABASE_URL: demoUrl.toString(),
    CACHE_DIR: path.join(root, 'apps', 'api', '.cache-demo'),
  },
});
api.on('exit', (code) => process.exit(code ?? 0));
