from collections import Counter
from urllib.parse import quote

import psycopg
from psycopg.types.json import Jsonb

from .raw import LOCK_ID, has_rows, land, land_many, landed_weeks

MAX_WEEK = 18  # a 17-week season just returns nothing for week 18
RECENT_WEEKS = 2  # stat corrections arrive within days, so in-season leagues refetch these
PLAYERS_EVERY = '20 hours'  # Sleeper asks for /players/nfl at most once a day


class LoadAlreadyRunning(RuntimeError):
    pass


def run_load(conn: psycopg.Connection, api, app: psycopg.Connection | None, usernames: list[str], *,
             first_season: int, refetch: bool = False, players: bool = True, log=print) -> Counter:
    """One recorded load: a raw.load_runs row, then Sleeper and the app's tables."""
    if not conn.execute('SELECT pg_try_advisory_lock(%s)', (LOCK_ID,)).fetchone()[0]:
        raise LoadAlreadyRunning('Another load is running against this database')
    options = {'usernames': usernames, 'first_season': first_season, 'refetch': refetch, 'players': players}
    run_id = conn.execute('INSERT INTO raw.load_runs (options) VALUES (%s) RETURNING run_id', (Jsonb(options),)).fetchone()[0]
    conn.commit()

    landed = Counter()
    try:
        with conn.cursor() as cur:
            load_sleeper(cur, api, run_id, usernames, first_season, refetch, players, landed, log)
            if app is not None:
                load_app_tables(cur, app, run_id, landed)
        conn.execute(
            "UPDATE raw.load_runs SET status = 'succeeded', finished_at = now(), rows_landed = %s, api_calls = %s WHERE run_id = %s",
            (Jsonb(dict(landed)), getattr(api, 'calls', None), run_id),
        )
        conn.commit()
    except BaseException as e:
        conn.rollback()  # what was committed (whole leagues) stays; the run says where it stopped
        conn.execute(
            "UPDATE raw.load_runs SET status = 'failed', finished_at = now(), rows_landed = %s, error = %s WHERE run_id = %s",
            (Jsonb(dict(landed)), f'{type(e).__name__}: {e}', run_id),
        )
        conn.commit()
        raise
    finally:
        conn.execute('SELECT pg_advisory_unlock(%s)', (LOCK_ID,))
        conn.commit()
    return landed


def load_sleeper(cur, api, run_id, usernames, first_season, refetch, players, landed: Counter, log) -> None:
    def put(table, key, payload):
        if land(cur, table, key, payload, run_id):
            landed[table] += 1

    state = api.get('/state/nfl')
    put('sleeper_state', {}, state)
    season = int(state.get('league_season') or state['season'])
    # Before the season no week has been played; after it, every week has.
    current_week = {'regular': min(int(state.get('week') or 0), MAX_WEEK), 'pre': 0}.get(state.get('season_type'), MAX_WEEK)

    leagues = {}
    for name in usernames:
        user = api.get(f'/user/{quote(name)}')
        if not user:
            log(f'No Sleeper user named {name!r}, skipped')
            continue
        put('sleeper_users', {'user_id': user['user_id']}, user)
        for year in range(first_season, season + 1):
            for league in api.get(f'/user/{user["user_id"]}/leagues/nfl/{year}') or []:
                leagues[league['league_id']] = league
    cur.connection.commit()

    for league in sorted(leagues.values(), key=lambda lg: (lg['season'], lg['league_id'])):
        load_league(cur, api, put, league, season, current_week, refetch)
        cur.connection.commit()  # a failed run keeps the leagues it finished
        log(f'{league["season"]} {league["name"]}: done')

    if players:
        load_players(cur, api, run_id, landed, log)
        cur.connection.commit()


def load_league(cur, api, put, league, season, current_week, refetch) -> None:
    league_id = league['league_id']
    status = league.get('status')
    complete = status == 'complete'
    put('sleeper_leagues', {'league_id': league_id}, league)

    # A finished league's users, rosters and drafts won't change, so they're fetched once.
    def needed(table, key):
        return refetch or not complete or not has_rows(cur, table, key)

    for table, path in (('sleeper_league_users', 'users'), ('sleeper_rosters', 'rosters')):
        if needed(table, {'league_id': league_id}):
            put(table, {'league_id': league_id}, api.get(f'/league/{league_id}/{path}') or [])
    if needed('sleeper_drafts', {'league_id': league_id}):
        drafts = api.get(f'/league/{league_id}/drafts') or []
        put('sleeper_drafts', {'league_id': league_id}, drafts)
        for draft in drafts:
            put('sleeper_draft_picks', {'draft_id': draft['draft_id']}, api.get(f'/draft/{draft["draft_id"]}/picks') or [])

    if status in ('pre_draft', 'drafting'):
        last_week = 0
    elif complete or int(league['season']) < season:
        last_week = MAX_WEEK
    else:
        last_week = current_week

    for table, path in (('sleeper_matchups', 'matchups'), ('sleeper_transactions', 'transactions')):
        have = set() if refetch else landed_weeks(cur, table, league_id)
        for week in range(1, last_week + 1):
            recent = not complete and week > last_week - RECENT_WEEKS
            if week in have and not recent:
                continue
            # An empty week is landed too, so it counts as fetched next time.
            put(table, {'league_id': league_id, 'week': week}, api.get(f'/league/{league_id}/{path}/{week}') or [])


def load_players(cur, api, run_id, landed: Counter, log) -> None:
    cur.execute(
        "SELECT EXISTS (SELECT 1 FROM raw.load_runs WHERE players_fetched AND status = 'succeeded'"
        f" AND started_at > now() - interval '{PLAYERS_EVERY}')"
    )
    if cur.fetchone()[0]:
        log(f'Players were fetched in the last {PLAYERS_EVERY}, skipped')
        return
    players = api.get('/players/nfl') or {}
    added = land_many(cur, 'sleeper_players', (({'player_id': pid}, p) for pid, p in players.items()), run_id)
    if added:
        landed['sleeper_players'] += added
    cur.execute('UPDATE raw.load_runs SET players_fetched = true WHERE run_id = %s', (run_id,))


def load_app_tables(cur, app: psycopg.Connection, run_id, landed: Counter) -> None:
    """The app's History rows and live feed, which aren't available anywhere else."""
    snapshots = app.execute('SELECT platform, league_id, season, week, to_jsonb(s) FROM league_snapshots s').fetchall()
    events = app.execute('SELECT id, to_jsonb(e) FROM live_events e').fetchall()
    app.rollback()  # read-only; don't leave a transaction open on the app's database

    for table, items in (
        ('app_league_snapshots', [({'platform': p, 'league_id': lg, 'season': s, 'week': w}, row) for p, lg, s, w, row in snapshots]),
        ('app_live_events', [({'event_id': event_id}, row) for event_id, row in events]),
    ):
        added = land_many(cur, table, items, run_id)
        if added:
            landed[table] += added
    cur.connection.commit()


def app_sleeper_usernames(app: psycopg.Connection) -> list[str]:
    """Sleeper accounts added in the app (League sources), on top of SLEEPER_USERNAMES."""
    try:
        rows = app.execute("SELECT value FROM league_sources WHERE platform = 'sleeper' ORDER BY id").fetchall()
    except psycopg.errors.UndefinedTable:  # the app hasn't run its migrations on this database
        rows = []
    app.rollback()
    return [r[0] for r in rows]
