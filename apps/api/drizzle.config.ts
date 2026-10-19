import { defineConfig } from 'drizzle-kit';

// `npm run db:generate -w @ffd/api` diffs src/db/schema.ts against the existing
// migrations and writes the new SQL into ./drizzle.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
