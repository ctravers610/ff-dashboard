# Fantasy Dashboard

[![CI](https://github.com/ctravers610/ff-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/ctravers610/ff-dashboard/actions/workflows/ci.yml)

One place to follow all of my fantasy football teams across platforms, instead of checking each site separately.

- **Matchups:** every league in one scoreboard table (my score, the opponent's, the margin), opening into projections, standings and side-by-side lineups
- **Lineup alerts:** empty slots and injured starters whose games haven't kicked off yet, each with the best healthy bench player who could still fill in
- **Waivers:** per league (Sleeper and ESPN), your FAAB and claim priority, the best available players ranked by next week, rest of season or Sleeper's trending adds, and suggested add/drop moves for byes, injuries and upgrades. A player is only suggested as a drop when someone as good at his position is still available
- **Waiver reminders:** browser push notifications at 9 PM ET before overnight runs and 2 hours before the rest, skipped once your claims are in (ESPN shows you your own pending claims; elsewhere you mark them set, from the tab or the notification)
- **Players:** where each player sits across all my leagues, who I'm facing this week, and "start and face" conflicts
- **History:** weekly results and points for every league, as charts or a table
- **All-play weeks:** ranks my score against the whole league (FFPC week 6: top half wins)

## Stack

- **Frontend:** React 19, TypeScript, Vite, TanStack Query, Tailwind CSS, Recharts
- **Backend:** Node.js, TypeScript, Fastify
- **Database:** PostgreSQL 17, Drizzle ORM, versioned SQL migrations
- **Security:** Sign in with GitHub (OAuth 2.0) limited to an allow-list, server-side sessions, AES-256-GCM encryption for stored OAuth tokens
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

The e2e tests never touch Sleeper, ESPN or your accounts. The API's upstream URLs are configurable, so the tests point it at a small fake server (`e2e/support/fake-upstream.ts`) that serves fixture data shaped like the real APIs, and `NODE_ENV=test` keeps your `.env` out of the run. Expected scores in the FFPC tests are worked out by hand from FFPC's published rules, so they check the scoring engine independently of its own code. GitHub sign-in is tested the same way, against a fake GitHub: the full redirect flow, a refused account, a forged callback, sign-out and session expiry. A separate spec scans every screen with axe-core for WCAG 2.1 AA violations, on desktop and phone widths.

### Production build in Docker

The deployable image runs the bundled API, which also serves the built web app, so the whole app is one container on one origin.

```bash
docker compose --profile app up --build    # http://localhost:8080, using your .env accounts, sign-in off
node scripts/smoke-test.mjs http://localhost:8080
```

The image runs as a non-root user, contains no secrets (they come from environment variables), and reports its commit at `/api/health`. It shuts down cleanly on `SIGTERM`, finishing in-flight requests first. `scripts/smoke-test.mjs` checks a running deployment: health and commit, the database (`/api/health?deep=1`), the web app and its caching, that signed-out requests get a 401, and JSON errors. CI builds the image and runs it, with sign-in on, on every push.

In production (`NODE_ENV=production`) the server refuses to start if sign-in isn't configured, if `PUBLIC_URL` isn't https, or if Yahoo is set up without a `TOKEN_ENCRYPTION_KEY`. The local compose preview runs with `AUTH_DISABLED=1` because it is only reachable from your own computer.

### Database

Tables are defined in `apps/api/src/db/schema.ts`. After changing it, generate a migration and commit the new SQL:

```bash
npm run db:generate -w @ffd/api
```

CI fails if the schema and migrations disagree. Tests that need Postgres create a throwaway database and drop it afterwards, so they never touch your data; they are skipped locally if no database is running, and required in CI.

The dashboard saves a snapshot of every league each time it loads (at most every 5 minutes per league), plus past weeks reconstructed from Sleeper and ESPN history, which feeds the History tab. Snapshots are only recorded while the API is running.

### Sign-in

Locally, sign-in is off unless you configure it. A deployment requires it:

1. Create an OAuth app at [github.com/settings/developers](https://github.com/settings/developers) with the callback URL `<your site>/api/auth/github/callback`. It needs no permissions; only your public profile is read.
2. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `PUBLIC_URL` and `GITHUB_ALLOWED_USER_IDS` (your numeric GitHub id, from `https://api.github.com/users/<username>`; ids never change, unlike usernames).

How it works: the sign-in uses the OAuth authorization-code flow with a one-time `state` checked against a cookie, so a forged callback can't sign you in as someone else. The GitHub token is used once to look up who you are, then discarded. A session is a random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` and `__Host-` over https); the database stores only its SHA-256 hash, so a database leak doesn't hand out live sessions. Sessions last 30 days, renewed as you use them, and sign-out deletes them on the server. A guard in front of every `/api` route returns 401 unless the route is deliberately public, and refuses state-changing requests from other sites' origins.

### Waiver reminders

Each league's waiver schedule is learned from when its past claims were processed (neither Sleeper nor ESPN states it reliably in its settings); FFPC's comes from its add/drop page. Every 5 minutes the server checks for reminders that are due and sends each one once, as a Web Push notification: encrypted for the browser, signed with the VAPID key pair from `.env`, and delivered by the browser's push service, so the dashboard doesn't need to be open.

Turn them on in the Waivers tab. Push needs a secure origin with a trusted certificate: the deployed site, or `http://localhost` (browsers treat plain localhost as secure). The local `https://localhost:5173` uses a self-signed certificate, which Chrome won't register a service worker on.

### ESPN cookies

Private ESPN leagues need two cookies from a browser where you're logged in to ESPN:

1. Open fantasy.espn.com and log in.
2. Open DevTools (F12) → **Application** tab → **Cookies** → `https://fantasy.espn.com`.
3. Copy the values of `espn_s2` and `SWID` into `ESPN_S2` and `ESPN_SWID` in `.env`.

The SWID (with its curly braces) is also how the dashboard knows which team is yours. These cookies act like a login, so keep them in `.env` only.

### Yahoo

Create an app at [developer.yahoo.com/apps](https://developer.yahoo.com/apps/create/) (Confidential Client, Fantasy Sports Read, redirect URI `https://localhost:5173/api/auth/yahoo/callback`), put the Client ID and Secret in `.env`, then click **Connect Yahoo** in the dashboard. Yahoo's tokens are stored in the database encrypted with `TOKEN_ENCRYPTION_KEY`, so set one first (see `.env.example`). Yahoo only serves Fantasy data to approved apps; apply at [sports.yahoo.com/developer](https://sports.yahoo.com/developer).
