// Started by Playwright as the API web server: prepares a clean database and
// cache folder, then boots the real API (the same server.ts that production runs).

import fs from 'node:fs/promises';
import { apiEnv } from './env.js';
import { recreateDatabase } from './database.js';

await recreateDatabase();
await fs.rm(apiEnv.CACHE_DIR!, { recursive: true, force: true });
await fs.mkdir(apiEnv.CACHE_DIR!, { recursive: true });

// Imported only now, because the API reads its configuration when first loaded.
await import('../../apps/api/src/server.js');
