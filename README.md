# Fantasy Dashboard

[![CI](https://github.com/ctravers610/ff-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/ctravers610/ff-dashboard/actions/workflows/ci.yml)

One place to follow all of my fantasy football teams across platforms, instead of checking each site separately.

- **Leagues:** live scores with projections and a projected winner for every matchup, standings, side-by-side lineups, and lineup alerts (empty slots, injured starters)
- **Players:** where each player sits across all my leagues, who I'm facing this week, and "start and face" conflicts
- **History:** weekly results and points for every league, as charts or a table
- **All-play weeks:** ranks my score against the whole league (FFPC week 6: top half wins)

## Stack

- **Frontend:** React 19, TypeScript, Vite, TanStack Query, Tailwind CSS, Recharts
- **Backend:** Node.js, TypeScript, Fastify
- **Database:** PostgreSQL 17, Drizzle ORM, versioned SQL migrations
- **Deployment:** one Docker image (the API also serves the built web app), API bundled with esbuild
- **Testing & CI:** Vitest (unit tests plus tests against a real Postgres), Playwright end-to-end tests with axe-core accessibility scans, GitHub Actions
- **Repo:** npm workspaces monorepo

```
apps/
  api/        Fastify server: platform adapters, scoring engine, caching, database
  web/        React dashboard
packages/
  shared/     Platform-neutral TypeScript types and page parsers used by both apps
e2e/          Playwright end-to-end tests, fixtures and a fake upstream server
```

Each platform has an **adapter** in `apps/api/src/adapters/<platform>/` that fetches that platform's data and maps it into one shared model, so the frontend never deals with platform differences. Pure mapping functions are kept apart from network calls, which keeps them easy to test.

## Platforms

| Platform | Status |
|---|---|
| Sleeper | ✅ Public API, multiple accounts |
| ESPN | ✅ Unofficial API, cookie auth for private leagues |
| FFPC | ✅ No usable API, so rosters come from pasting FFPC's Live Scoring page; scores then update live (see below) |
| Yahoo | OAuth 2.0 sign-in works; Fantasy API data is pending Yahoo's app approval |

### FFPC (manual import with live scoring)

FFPC's terms prohibit unapproved scripts, so the dashboard never contacts FFPC. Once a week, copy FFPC's **Live Scoring** page (Ctrl+A, Ctrl+C) and paste it into the league's dialog. That fills in the roster and both lineups. Scores and projections then update every minute by running Sleeper's real-time stats through FFPC's published scoring rules (checked against FFPC's own totals: 20 of 20 starters matched exactly).

## Running locally

Requires Node 20.12+ and Docker.

```bash
npm install
cp .env.example .env     # then fill in your accounts
docker compose up -d     # PostgreSQL on localhost:5432
npm run dev              # API on :3001, web on https://localhost:5173
```

The API applies database migrations on startup. The dev site uses HTTPS with a self-signed certificate (Yahoo only accepts `https` redirect URIs), so the browser asks you to continue once.

Other scripts: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`.

### Tests

- `npm test` runs the fast tests: unit tests for the mappers, parsers and scoring engine, plus tests against a throwaway Postgres.
- `npm run e2e` runs Playwright end to end. It boots the real stack (the production web build, the real API, a real Postgres database `ffd_e2e` that it creates and drops) and drives it in Chromium. Run `npx playwright install chromium` once first.

The e2e tests never touch Sleeper, ESPN or your accounts. The API's upstream URLs are configurable, so the tests point it at a small fake server (`e2e/support/fake-upstream.ts`) that serves fixture data shaped like the real APIs, and `NODE_ENV=test` keeps your `.env` out of the run. Expected scores in the FFPC tests are worked out by hand from FFPC's published rules, so they check the scoring engine independently of its own code. A separate spec scans every screen with axe-core for WCAG 2.1 AA violations, in light and dark mode.

### Production build in Docker

The deployable image runs the bundled API, which also serves the built web app, so the whole app is one container on one origin.

```bash
docker compose --profile app up --build    # http://localhost:8080, using your .env accounts
node scripts/smoke-test.mjs http://localhost:8080
```

The image runs as a non-root user, contains no secrets (they come from environment variables), and reports its commit at `/api/health`. It shuts down cleanly on `SIGTERM`, finishing in-flight requests first. `scripts/smoke-test.mjs` checks a running deployment: health and commit, the database, the web app and its caching, and JSON errors. CI builds the image and runs it on every push.

### Database

Tables are defined in `apps/api/src/db/schema.ts`. After changing it, generate a migration and commit the new SQL:

```bash
npm run db:generate -w @ffd/api
```

CI fails if the schema and migrations disagree. Tests that need Postgres create a throwaway database and drop it afterwards, so they never touch your data; they are skipped locally if no database is running, and required in CI.

The dashboard saves a snapshot of every league each time it loads (at most every 5 minutes per league), plus past weeks reconstructed from Sleeper and ESPN history, which feeds the History tab. Snapshots are only recorded while the API is running.

### ESPN cookies

Private ESPN leagues need two cookies from a browser where you're logged in to ESPN:

1. Open fantasy.espn.com and log in.
2. Open DevTools (F12) → **Application** tab → **Cookies** → `https://fantasy.espn.com`.
3. Copy the values of `espn_s2` and `SWID` into `ESPN_S2` and `ESPN_SWID` in `.env`.

The SWID (with its curly braces) is also how the dashboard knows which team is yours. These cookies act like a login, so keep them in `.env` only.

### Yahoo

Create an app at [developer.yahoo.com/apps](https://developer.yahoo.com/apps/create/) (Confidential Client, Fantasy Sports Read, redirect URI `https://localhost:5173/api/auth/yahoo/callback`), put the Client ID and Secret in `.env`, then click **Connect Yahoo** in the dashboard. Yahoo only serves Fantasy data to approved apps; apply at [sports.yahoo.com/developer](https://sports.yahoo.com/developer).
