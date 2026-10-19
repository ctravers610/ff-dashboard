// Production build: bundles the API into one JavaScript file, dist/server.js.
//
// Our own workspace packages (@ffd/shared) are TypeScript source, so they are
// bundled in. Third-party packages stay external: they are installed normally in
// the production image, which keeps native/CJS packages like pg working as-is.

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies)
  .filter((name) => !name.startsWith('@ffd/'))
  .flatMap((name) => [name, `${name}/*`]); // include subpath imports like drizzle-orm/pg-core

await build({
  entryPoints: ['src/server.ts'],
  // Same folder depth as src/, so config.ts's paths (repo root, migrations,
  // web build) resolve identically from source and from the bundle.
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external,
  sourcemap: true, // stack traces in production logs point at the TypeScript source
  logLevel: 'info',
});
