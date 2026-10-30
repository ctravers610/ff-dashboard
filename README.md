# Fantasy Dashboard

[![CI](https://github.com/ctravers610/ff-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/ctravers610/ff-dashboard/actions/workflows/ci.yml)

One place to follow all of my fantasy football teams across platforms, instead of checking each site separately.

- **Add league:** add Sleeper accounts and ESPN leagues from the dashboard (each is checked against the platform first), connect Yahoo, or paste an FFPC league. `SLEEPER_USERNAMES` and `ESPN_LEAGUE_IDS` in `.env` still work too, for a fresh setup
- **Live scoring** (a column beside the matchups): while games are on, every scoring change for your players and this week's opponents, checked every 30 seconds and scored by each league's own rules (green helps you, red hurts you, gray has no effect; scoring plays stand out and small gains shrink to one line)
- **Matchups:** every league in one scoreboard table (my score, the opponent's, the margin), opening into projections, standings and side-by-side lineups
- **Lineup alerts:** empty slots and injured starters whose games haven't kicked off yet, each with the best healthy bench player who could still fill in
- **Waivers:** per league (Sleeper, ESPN, Yahoo and FFPC), your FAAB and claim priority, the best available players ranked by next week, rest of season or Sleeper's trending adds, and suggested add/drop moves for byes, injuries and upgrades. A player is only suggested as a drop when someone as good at his position is still available. In FAAB leagues, each available player has a **likely bid**, and each suggested move says what to bid (see below)
- **Lineup check:** a push 90 minutes before a lineup problem locks: a starter who's out or doubtful (before his game), questionable with a healthy swap available, on bye, or an empty slot (before the week's first game)
- **Waiver reminders:** browser push notifications at 9 PM ET before overnight runs and 2 hours before the rest, skipped once your claims are in (ESPN shows you your own pending claims; elsewhere you mark them set, from the tab or the notification)
- **Players:** where each player sits across all my leagues, who I'm facing this week, and "start and face" conflicts
- **Lineup recap:** for each finished week, your score against the best lineup your roster could have fielded, the start/sit calls that cost points, whether the best lineup would have flipped a loss, and free agents who'd have beaten your starters; plus a Tuesday-morning push summing up the week
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
analytics/    Python loader for the analytics warehouse (see Analytics below)
```

Each platform has an **adapter** in `apps/api/src/adapters/<platform>/` that fetches that platform's data and maps it into one shared model, so the frontend never deals with platform differences. Pure mapping functions are kept apart from network calls, which keeps them easy to test.

## Platforms

| Platform | Status |
|---|---|
| Sleeper | ✅ Public API, multiple accounts |
| ESPN | ✅ Unofficial API, cookie auth for private leagues |
| FFPC | ✅ No usable API, so rosters come from pasting FFPC's Live Scoring page; scores then update live (see below) |
| Yahoo | ✅ Official Fantasy API (OAuth 2.0): lineups, standings, History, the live feed, recaps, playoff odds and waivers |

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

The e2e tests never touch Sleeper, ESPN or your accounts. The API's upstream URLs are configurable, so the tests point it at a small fake server (`packages/demo/src/fake-upstream.ts`) that serves fixture data shaped like the real APIs, and `NODE_ENV=test` keeps your `.env` out of the run. Expected scores in the FFPC tests are worked out by hand from FFPC's published rules, so they check the scoring engine independently of its own code. GitHub sign-in is tested the same way, against a fake GitHub: the full redirect flow, a refused account, a forged callback, sign-out and session expiry. A separate spec scans every screen with axe-core for WCAG 2.1 AA violations, on desktop and phone widths.

### Demo mode

A public demo of the whole app with made-up leagues on Sleeper, ESPN and FFPC, frozen in week 6 of a season:

```bash
docker compose up -d     # Postgres, if it isn't running
npm run demo             # http://localhost:8090
# or, in the production image with its own throwaway database:
docker compose --profile demo up --build    # http://localhost:8090
```

`DEMO_MODE=1` starts the same fake upstream the end-to-end tests use (`packages/demo`) inside the API on a loopback port and points the app at it. There's no sign-in, and the API refuses every request that would change something, so it's safe to put on the internet. It never reads `.env`, so none of your accounts, cookies or keys can reach it, and it uses its own database (`ffd_demo`).

### Production build in Docker

The deployable image runs the bundled API, which also serves the built web app, so the whole app is one container on one origin.

```bash
docker compose --profile app up --build    # http://localhost:8080, using your .env accounts, sign-in off
node scripts/smoke-test.mjs http://localhost:8080
```

The image runs as a non-root user, contains no secrets (they come from environment variables), and reports its commit at `/api/health`. It shuts down cleanly on `SIGTERM`, finishing in-flight requests first. `scripts/smoke-test.mjs` checks a running deployment: health and commit, the database (`/api/health?deep=1`), the web app and its caching, that signed-out requests get a 401, and JSON errors. CI builds the image and runs it, with sign-in on, on every push.

In production (`NODE_ENV=production`) the server refuses to start if sign-in isn't configured, if `PUBLIC_URL` isn't https, or if Yahoo is set up without a `TOKEN_ENCRYPTION_KEY`. The local compose preview runs with `AUTH_DISABLED=1` because it is only reachable from your own computer.

### Deploying

`render.yaml` deploys two services from the Dockerfile on [Render](https://render.com), with Postgres on [Neon](https://neon.tech):

- **ffd-app**, the private dashboard, behind GitHub sign-in.
- **ffd-demo**, the public demo (`DEMO_MODE=1`).

Both are on Render's free plan, which sleeps after about 15 minutes without visitors and takes about a minute to wake. Push reminders and the live feed run on timers inside the app, so on the free plan they only run while it's awake; set `ffd-app`'s plan to `starter` (paid, always on) to have them run all the time.

1. In Neon, create a project with two databases, `ffd` and `ffd_demo`, and copy each one's connection string.
2. Create a GitHub OAuth app for the live site (callback `https://<ffd-app host>/api/auth/github/callback`).
3. In Render, choose **New > Blueprint**, pick this repository, and fill in the values it asks for: each service's `PUBLIC_URL` and `DATABASE_URL`, the GitHub app, your ESPN cookies and the VAPID keys.
4. Once both are live, run the smoke test against each: `node scripts/smoke-test.mjs https://<host>`.

Two scheduled GitHub workflows look after the live site:

- **Keep awake** (`keep-awake.yml`) wakes the dashboard every 10 minutes around waiver deadlines and game days, so reminders and the live feed run on the free plan (about 220 of Render's 750 free hours a month).
- **Live check** (`live-check.yml`) runs the smoke test against both sites every morning.

Either one failing means GitHub emails you. To back up the live database to `backups/` (git-ignored), with Docker running: set `BACKUP_DATABASE_URL` to its Neon connection string and run `npm run backup`.

The site can be installed like an app ("Add to Home Screen"). On an iPhone, that's required for push reminders.

Each push to `main` redeploys both services once CI passes. The app applies database migrations on startup. Your Sleeper and ESPN leagues are added in the app (Add league), as locally.

### Database

Tables are defined in `apps/api/src/db/schema.ts`. After changing it, generate a migration and commit the new SQL:

```bash
npm run db:generate -w @ffd/api
```

CI fails if the schema and migrations disagree. Tests that need Postgres create a throwaway database and drop it afterwards, so they never touch your data; they are skipped locally if no database is running, and required in CI.

The dashboard saves a snapshot of every league each time it loads (at most every 5 minutes per league), plus past weeks reconstructed from Sleeper and ESPN history, which feeds the History tab. Snapshots are only recorded while the API is running. FFPC has no history to read, so the app keeps every week's pasted matchup and re-scores a finished week from its starters and the week's final stats. If the paste came before every starter's game kicked off, a late swap could have changed the lineup, so History marks that week as an estimate.

### Sign-in

Locally, sign-in is off unless you configure it. A deployment requires it:

1. Create an OAuth app at [github.com/settings/developers](https://github.com/settings/developers) with the callback URL `<your site>/api/auth/github/callback`. It needs no permissions; only your public profile is read.
2. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `PUBLIC_URL` and `GITHUB_ALLOWED_USER_IDS` (your numeric GitHub id, from `https://api.github.com/users/<username>`; ids never change, unlike usernames).

How it works: the sign-in uses the OAuth authorization-code flow with a one-time `state` checked against a cookie, so a forged callback can't sign you in as someone else. The GitHub token is used once to look up who you are, then discarded. A session is a random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` and `__Host-` over https); the database stores only its SHA-256 hash, so a database leak doesn't hand out live sessions. Sessions last 30 days, renewed as you use them, and sign-out deletes them on the server. A guard in front of every `/api` route returns 401 unless the route is deliberately public, and refuses state-changing requests from other sites' origins.

### Waiver reminders

Each league's waiver schedule is learned from when its past claims were processed (neither Sleeper nor ESPN states it reliably in its settings); FFPC's comes from its add/drop page. Every 5 minutes the server checks for reminders that are due and sends each one once, as a Web Push notification: encrypted for the browser, signed with the VAPID key pair from `.env`, and delivered by the browser's push service, so the dashboard doesn't need to be open.

Turn them on in the Waivers tab. Push needs a secure origin with a certificate the browser trusts, which the deployed site has. Locally, the dev server uses a certificate from `certs/` if there is one, so make one your machine trusts with [mkcert](https://github.com/FiloSottile/mkcert) (once):

```bash
winget install FiloSottile.mkcert
mkcert -install
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
```

`mkcert -install` adds a root certificate that only exists on your machine to its trust store. Without `certs/`, the dev server falls back to a self-signed certificate: everything else works, but Chrome won't register the service worker push needs.

### Likely FAAB bids, and what to bid

In FAAB leagues, Waivers estimates the bid you'd have to beat for each available player, from what each bidder on similar players had to beat: every claim in your FAAB leagues, as a share of that league's budget. Claims count more for the same position, a similarly ranked player (by Sleeper's projections over the next four weeks), a similar point in the season, the same league (double) and recent seasons (each season back counts 0.8 as much). It shows the range that bid fell in half the time when someone else wanted him, or nothing when fewer than about four similar claims back it up. The model is `apps/api/src/waivers/pricing.ts`.

Every player you'd have to bid on then gets a bid, on suggested moves and in Best available, in three steps:

1. **The odds of each bid.** On similar claims, how often no one else bid at all, and otherwise how often this bid beats what the bidders had to beat. No team can bid more than it has left, so a bid that tops every other team's balance is certain, and any other bid leaves room for a bidding war. A tie goes by your place in the claim order.
2. **What he's worth to you.** His points are what he adds to his best slot in your lineup: the gain this week or, if he's better than the starter and your best bench player there for good, that gain over the rest of the season. Someone who wouldn't start for you is worth $0. A point costs what you have left over the points it could still buy: the smallest upgrade worth a claim (3 points a week), made each week from now on and lasting to the end. So money gets freer as the weeks run out. This step is a judgment call rather than something the data can test.
3. **The bid.** The one with the best payoff: its chance of winning times what you'd keep of his worth after paying it. Suggested moves are sized out of what the ones before them leave, since bids in one run can all win. Other players are sized on their own, so those bids can add up to more than you have.

Free agents get no bid, since you can just add them.

This season's claims come from every platform. Yahoo also keeps earlier seasons, so a Yahoo league's past seasons (followed back through each league it was renewed from) are loaded in the background; until they're in, prices use this season alone. Yahoo doesn't report the starting budget, so it's worked out from each team's balance plus its winning bids.

What each team had to beat comes from the losing bids: Yahoo's site (with a `YAHOO_COOKIE`, this season and past ones) and Sleeper's failed claims. Where they aren't known (ESPN), a claim only says what a rival paid. Waivers also says how much you've overpaid on contested wins and how close your contested losses were.

Backtested on 1,298 real bids from 2020 to 2026 in two leagues, each priced only from claims made before it, against the same model using winning bids alone:

| Bids meant to win | With losing bids | Winning bids alone |
| --- | --- | --- |
| 50% | won 52% | won 58% |
| 75% | won 77% | won 78% |
| 90% | won 91% | won 91% |
| Average price of a win, per $100 of budget | $2.70 | $4.90 |

That average is from a simulation that assumes each player was worth half again what the team really bid. Odds come out about right every season taken together, but single seasons swing both ways (bids meant to win 50% won 44% in 2023 and 61% in 2026). Counting recent seasons more didn't help: making seasons count less with age, or counting this season extra, made the odds worse overall, so a season's level doesn't seem predictable from the seasons before it. Bidding wars on breaking news are mostly beyond the model.

`npm run backtest:faab` reruns that backtest on your own leagues and prints the numbers.

### ESPN cookies

Private ESPN leagues need two cookies from a browser where you're logged in to ESPN:

1. Open fantasy.espn.com and log in.
2. Open DevTools (F12) → **Application** tab → **Cookies** → `https://fantasy.espn.com`.
3. Copy the values of `espn_s2` and `SWID` into `ESPN_S2` and `ESPN_SWID` in `.env`.

The SWID (with its curly braces) is also how the dashboard knows which team is yours. These cookies act like a login, so keep them in `.env` only.

### Yahoo

Create an app at [developer.yahoo.com/apps](https://developer.yahoo.com/apps/create/) (Confidential Client, Fantasy Sports Read, redirect URI `https://localhost:5173/api/auth/yahoo/callback`), put the Client ID and Secret in `.env`, then click **Connect Yahoo** in the dashboard. Yahoo's tokens are stored in the database encrypted with `TOKEN_ENCRYPTION_KEY`, so set one first (see `.env.example`). Yahoo only serves Fantasy data to approved apps; apply at [sports.yahoo.com/developer](https://sports.yahoo.com/developer). Approval covers apps that already had Fantasy Sports checked. If the dashboard still says Yahoo hasn't turned on access, create a new app (editing the old one doesn't work) and submit its Client ID at [sports.yahoo.com/developer/application-confirmation](https://sports.yahoo.com/developer/application-confirmation/). After putting the new app's Client ID and Secret in `.env`, click **Reconnect Yahoo** under **Add league** so the old app's saved sign-in is replaced.

**Losing bids (optional).** Yahoo's API only reports winning bids; it blanks the rest. Its website lists them all, so with `YAHOO_COOKIE` set, Waivers shows every bid on each contested claim in FAAB leagues. To get the cookie:

1. Sign in at [football.fantasysports.yahoo.com](https://football.fantasysports.yahoo.com/) in a desktop browser, and open your league's Transactions page.
2. Open DevTools (F12) → **Network**, reload, and click the first request (`transactions`).
3. Under **Request Headers**, copy the whole value of `Cookie`, and put it in `.env` in single quotes: `YAHOO_COOKIE='...'`. On Render, paste it without the quotes.

This cookie is a login to your whole Yahoo account, far more than the read-only Fantasy access **Connect Yahoo** grants, and reading the site this way is unofficial, so it could stop working if Yahoo changes the page. Keep it in `.env` and your host's secret settings only. The app sends it only to `football.fantasysports.yahoo.com`, only to read that page, at most once every 30 minutes per league. It expires when Yahoo ends the session, and signing out of Yahoo ends it too; Waivers says so when that happens, and the rest of Yahoo keeps working.

Yahoo has no projections, so Waivers uses Sleeper's, matched to Yahoo's players by position and name and scored with each Yahoo league's own scoring (yardage bonuses aren't counted). Trades and the trade finder are Sleeper-only (the finder also covers ESPN), and History's **All seasons** panel is Sleeper-only.

## Analytics

`analytics/` is a warehouse for league history, in a separate `ffd_analytics` database:
- a Python loader (`analytics/loader`) copies raw data in
- dbt models (`analytics/warehouse`) turn it into tables, with metrics defined in MetricFlow
- an Airflow DAG (`analytics/orchestration`), or a daily GitHub Actions workflow, keeps it current

The app reads one table from it, for History's **All seasons** panel, and only if `ANALYTICS_DATABASE_URL` is set.

```bash
cd analytics
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"   # the loader and dbt; macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m loader          # first run creates ffd_analytics and loads every season
.venv/Scripts/python -m pytest          # loader tests

cd warehouse
../.venv/Scripts/dbt deps               # once: installs dbt_utils
../.venv/Scripts/dbt build              # builds every model and runs its tests
../.venv/Scripts/dbt source freshness   # warns if the loader hasn't succeeded in 8 days
../.venv/Scripts/sqlfluff lint models tests   # SQL style, as CI checks it
../.venv/Scripts/mf query --metrics win_pct,all_play_win_pct,luck_pct --group-by team__team_name,league__season
```

(`mf`, MetricFlow's command line, works on Linux and macOS but currently fails on Windows. On Windows, run it in the Airflow container, described under Orchestration below.)

### Loader

What it loads, into the `raw` schema:

- **Sleeper:** your users, every league since 2017 (`--first-season` to change), their users, rosters, drafts and picks, each week's matchups and transactions, and the player list (at most once a day, as Sleeper asks). Usernames come from `SLEEPER_USERNAMES` plus accounts added in the app, or `--username`.
- **The app's database:** `league_snapshots` (History, including FFPC) and `live_events`, which exist nowhere else.

ESPN, Yahoo and FFPC aren't fetched: ESPN's API is unofficial and needs your cookies, Yahoo needs your sign-in, and FFPC is never contacted. Their weeks still reach the warehouse through `league_snapshots`.

Each table holds the payload exactly as the source sent it, plus the columns that identify the item (`league_id`, `week`, …). A row is only added when the payload differs from that item's latest one, so loading again is safe and changes such as stat corrections are kept as versions. Finished leagues and weeks are fetched once; leagues in season refetch their rosters and the last two weeks. Every run is recorded in `raw.load_runs` (status, rows added, Sleeper calls, error), and an advisory lock stops two loads overlapping.

Settings: `ANALYTICS_DATABASE_URL` (default: `ffd_analytics` on the local Postgres) and `APP_DATABASE_URL` (default: `DATABASE_URL`, read-only).

`python -m loader --schema-only` creates the database and raw tables without loading anything. `python -m loader.fixture` loads a made-up league instead of real data: two seasons of four teams, with waiver claims, a trade and an empty lineup slot, the same every time. CI and the docs site use it.

### dbt models

In `analytics/warehouse` (dbt Core 1.12 with dbt-postgres). Its profile defaults to the local Postgres; for another database set `ANALYTICS_DB_HOST`, `ANALYTICS_DB_PORT`, `ANALYTICS_DB_USER`, `ANALYTICS_DB_PASSWORD`, `ANALYTICS_DB_NAME` and `ANALYTICS_DB_SSLMODE` (`require` for Neon).

- **Sources** (`models/staging/_sources.yml`) describe the raw tables, with a freshness check on `raw.load_runs`.
- **Staging** (schema `staging`, views): one model per raw table, each reading the latest version of every item and turning the JSON into typed columns. Arrays become rows: `stg_sleeper__matchup_players` has one row per player per team per week, `stg_sleeper__transaction_moves` one per player added or dropped.
- **Intermediate** (schema `intermediate`, views): each league's lineup slots, each team's opponent, and `int_best_lineups`, the best lineup each team could have set each week. It fills slots by the same rules as the app's Lineup Recap (narrowest first: QB, RB, … then FLEX, then SUPER_FLEX; see `macros/lineup_slots.sql`), and gives the same totals.
- **Marts** (schema `marts`, tables): a star schema to query.
  - Dimensions: `dim_league` (with `league_lineage_id` tying a league's seasons together), `dim_team`, `dim_manager`, `dim_player`, `dim_player_history` (type 2: team, status and injury over time) and `dim_week` (from the `nfl_seasons` seed).
  - Facts: `fct_team_week` (score, result, median result, all-play record, best lineup and points left on the bench), `fct_player_week` (who started where, and where the best lineup would have used him), `fct_transaction_moves` (every add and drop, with what each pickup then scored for that team) and `fct_live_event_scores` (the app's live feed).
  - `fct_player_week` and `fct_live_event_scores` are incremental: a run processes only league weeks with new matchups, or new events. After changing their logic, rebuild with `dbt build --full-refresh`.
  - Aggregate: `agg_team_season`, one row per team per league season (regular season only). It has the record head to head, against the median and all-play; expected wins and luck; points left on the bench and lineup efficiency; pickups and FAAB; and the finish. For the current season its luck numbers match the app's own luck table.
- **Metrics** (`models/metrics/_metrics.yml`): MetricFlow semantic models over the team weeks, teams and leagues. Each metric is defined once, so new questions are queries rather than new SQL:
  - `win_pct` and `all_play_win_pct`
  - `luck_pct`: the first minus the second
  - `lineup_efficiency`
  - `points_left_on_bench`
  - plus the counts they're built from
- **Contracts:** every mart has an enforced contract (`models/marts/_marts.yml`). Its columns and their types are fixed, dbt refuses to build one whose SQL returns anything else, and primary keys and not-null columns are real Postgres constraints.
- **Unit tests** (`_intermediate.yml`, `_marts_unit_tests.yml`) run a model's SQL on a few hand-written rows and compare the output exactly. They cover:
  - the best-lineup fill order, including the case where filling SUPER_FLEX before FLEX gives a worse lineup
  - opponent pairing and commissioner overrides
  - results, median and all-play, with unfinished weeks left blank
  - the player history merge
  - league lineage across seasons
  - an incremental run of `fct_player_week`
  - pickups credited only until they're dropped
  - a season's luck, with playoff and unfinished weeks left out
- **Data tests:** primary keys, relationships between models, allowed values, and checks in `tests/`:
  - starters' points add up to Sleeper's team scores
  - every best lineup is legal
  - the two teams in a game have opposite results
  - each all-play record covers the whole league
- **Linting:** sqlfluff (`.sqlfluff`), templated through dbt so macros and refs resolve. Models read their inputs in import CTEs at the top (`with leagues as (select * from {{ ref(...) }})`) rather than aliasing a `ref()` directly, which also keeps `dbt run --empty` working.

`dim_player_history` is built from the raw versions rather than a dbt snapshot, since the loader already keeps every version Sleeper has served. Its history starts with the first load.

CI loads the fixture league, lints the SQL, creates every model empty (`dbt run --empty`, so unit tests of incremental models can read their own columns), then runs `dbt build`. It builds the whole project every time. On a database that starts empty a full build takes seconds, and building only what a pull request changed would need a persistent warehouse to defer the rest to.

### Docs site

The `Warehouse docs` workflow publishes the dbt docs (models, columns, tests and the lineage graph) to GitHub Pages whenever `analytics/` changes on `main`. It's built on the fixture league, so no real league data is published. It needs Pages turned on once, with **Settings → Pages → Source: GitHub Actions**.

### Orchestration

`analytics/orchestration/dags/ffd_warehouse.py` is an Airflow DAG that runs daily at 11:00 UTC:
1. **load:** runs the loader.
2. **dbt:** the whole dbt project as an Airflow task group, built with [Astronomer Cosmos](https://github.com/astronomer/astronomer-cosmos). Each model is a task, followed by that model's tests. A test that reads several models runs as its own task once all of them are built.
3. **source_freshness:** checks the loader is still succeeding.

To run it on this computer, against the local Postgres:

```bash
docker compose --profile airflow up --build    # then http://localhost:8081
docker compose logs airflow | grep -i password  # the admin password
```

dbt and the loader run in their own virtualenv inside the Airflow image, so their dependencies don't clash with Airflow's. `analytics/` is mounted into the container, so edits to models or the DAG don't need a rebuild.

To run the whole DAG once from the command line:

```bash
docker compose --profile airflow run --rm airflow bash -c "airflow db migrate && airflow dags test ffd_warehouse"
```

### Hosting the warehouse

For a warehouse that stays current without this computer, the `Warehouse load` workflow runs the same steps as the DAG every morning on GitHub Actions. It doesn't need an Airflow host. It does nothing until it has a database to write to:

1. **Create the database.** In the Neon project that holds the app's database, create a database called `ffd_analytics`.
2. **Create a read-only role for the app.** In Neon's SQL editor, connected to `ffd_analytics`, replace `<owner>` with the role that owns the database (the one the workflow will connect as) and run:

   ```sql
   create role ffd_reader with login password '<a new password>';
   create schema if not exists marts;
   grant connect on database ffd_analytics to ffd_reader;
   grant usage on schema marts to ffd_reader;
   grant select on all tables in schema marts to ffd_reader;
   -- dbt rebuilds tables on every run, so new ones need the grant too.
   alter default privileges for role <owner> in schema marts grant select on tables to ffd_reader;
   ```

3. **Add the repository secrets** (Settings → Secrets and variables → Actions):
   - `ANALYTICS_DATABASE_URL`: `ffd_analytics` as the owner role, so the workflow can write.
   - `APP_DATABASE_URL`: the app's database, read for Sleeper accounts added in the app, History and the live feed. A read-only role is enough.
   - `SLEEPER_USERNAMES` (optional): more accounts, comma-separated.
4. **Run it once:** Actions → Warehouse load → Run workflow. The first run loads every season.
5. **Connect the app.** In Render, set the app's `ANALYTICS_DATABASE_URL` to `ffd_analytics` as `ffd_reader`. History then shows **All seasons** for your Sleeper leagues.

The two `ANALYTICS_DATABASE_URL`s point at the same database as different roles: the workflow's can write, the app's can only read. The app also opens every warehouse connection as read-only, whatever role it's given.
