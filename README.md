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
- **Database:** PostgreSQL 17 in Docker, Drizzle ORM, versioned SQL migrations
- **Testing & CI:** Vitest (unit tests plus tests against a real Postgres), GitHub Actions
- **Repo:** npm workspaces monorepo

```
apps/
  api/        Fastify server: platform adapters, scoring engine, caching, database
  web/        React dashboard
packages/
  shared/     Platform-neutral TypeScript types and page parsers used by both apps
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

Other scripts: `npm test`, `npm run typecheck`, `npm run build`.

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
