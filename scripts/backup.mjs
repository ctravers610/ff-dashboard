// `npm run backup`: saves a copy of a database to backups/ on this computer,
// using pg_dump from the Postgres Docker image (so nothing else to install).
// Point it at the live database with BACKUP_DATABASE_URL, e.g. in PowerShell:
//
//   $env:BACKUP_DATABASE_URL = '<Neon connection string for ffd>'; npm run backup
//
// The file is in pg_dump's compressed format; restore it with pg_restore. The
// backups/ folder is git-ignored: dumps hold your data and must never be committed.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.BACKUP_DATABASE_URL;
if (!url) {
  console.error('Set BACKUP_DATABASE_URL to the connection string of the database to back up.');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'backups');
fs.mkdirSync(dir, { recursive: true });
const name = new URL(url).pathname.replace('/', '') || 'database';
const file = path.join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.dump`);

// The connection string goes in through the environment, never the command line,
// so it doesn't show up in the process list.
const dump = spawn('docker', ['run', '--rm', '-e', 'DATABASE_URL', 'postgres:17-alpine', 'sh', '-c', 'pg_dump "$DATABASE_URL" --format=custom --no-owner'], {
  env: { ...process.env, DATABASE_URL: url },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const out = fs.createWriteStream(file);
dump.stdout.pipe(out);
dump.on('close', (code) => {
  out.close();
  if (code !== 0) {
    fs.rmSync(file, { force: true });
    console.error(`pg_dump failed (exit ${code}). Is Docker running?`);
    process.exit(code ?? 1);
  }
  console.log(`Saved ${path.relative(root, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
});
