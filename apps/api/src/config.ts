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
  cacheDir: path.join(rootDir, 'apps', 'api', '.cache'),
};
