from collections import Counter

import psycopg
import pytest

from loader.load import app_sleeper_usernames, run_load

from .conftest import FakeSleeper


def matchup(points):
    return [{'roster_id': 1, 'matchup_id': 1, 'points': points}, {'roster_id': 2, 'matchup_id': 1, 'points': 90.0}]


def sleeper_routes():
    """Week 8 of 2026: one finished 2025 league, one 2026 league in season, one still to draft."""
    routes = {
        '/state/nfl': {'season': '2026', 'league_season': '2026', 'week': 8, 'season_type': 'regular'},
        '/user/colin': {'user_id': 'u1', 'username': 'colin'},
        '/user/u1/leagues/nfl/2025': [{'league_id': 'L25', 'name': 'Dynasty', 'season': '2025', 'status': 'complete'}],
        '/user/u1/leagues/nfl/2026': [
            {'league_id': 'L26', 'name': 'Dynasty', 'season': '2026', 'status': 'in_season'},
            {'league_id': 'LPRE', 'name': 'Best Ball', 'season': '2026', 'status': 'pre_draft'},
        ],
        '/players/nfl': {'4046': {'full_name': 'Patrick Mahomes', 'team': 'KC'}, '4034': {'full_name': 'Christian McCaffrey', 'team': 'SF'}},
    }
    for league_id, weeks in (('L25', 17), ('L26', 8)):
        routes[f'/league/{league_id}/users'] = [{'user_id': 'u1'}, {'user_id': 'u2'}]
        routes[f'/league/{league_id}/rosters'] = [{'roster_id': 1, 'owner_id': 'u1'}, {'roster_id': 2, 'owner_id': 'u2'}]
        routes[f'/league/{league_id}/drafts'] = [{'draft_id': f'D{league_id}'}]
        routes[f'/draft/D{league_id}/picks'] = [{'pick_no': 1, 'player_id': '4034'}]
        for week in range(1, weeks + 1):
            routes[f'/league/{league_id}/matchups/{week}'] = matchup(100.0 + week)
            routes[f'/league/{league_id}/transactions/{week}'] = [{'type': 'waiver', 'leg': week}]
    return routes


def load(conn, api, app=None, **options):
    logs = []
    landed = run_load(conn, api, app, options.pop('usernames', ['colin']), first_season=2025, log=logs.append, **options)
    return landed, logs


def count(conn, table, **where):
    clause = ' AND '.join(f'{k} = %({k})s' for k in where) or 'TRUE'
    return conn.execute(f'SELECT count(*) FROM raw.{table} WHERE {clause}', where).fetchone()[0]


def fetched(api, prefix):
    return [p for p in api.paths if p.startswith(prefix)]


def test_the_first_load_lands_every_league_and_week(conn):
    landed, _ = load(conn, FakeSleeper(sleeper_routes()))

    assert landed['sleeper_leagues'] == 3
    # A finished league gets every week up to 18; week 18 of a 17-week season is landed empty.
    assert count(conn, 'sleeper_matchups', league_id='L25') == 18
    assert conn.execute("SELECT payload FROM raw.sleeper_matchups WHERE league_id = 'L25' AND week = 18").fetchone()[0] == []
    # A league in season gets the weeks played so far; one still to draft gets none.
    assert count(conn, 'sleeper_matchups', league_id='L26') == 8
    assert count(conn, 'sleeper_transactions', league_id='L26') == 8
    assert count(conn, 'sleeper_matchups', league_id='LPRE') == 0
    assert count(conn, 'sleeper_players') == 2
    assert count(conn, 'sleeper_draft_picks') == 2

    run = conn.execute('SELECT status, players_fetched, api_calls, rows_landed FROM raw.load_runs').fetchone()
    assert run[:2] == ('succeeded', True)
    assert run[2] > 0 and run[3]['sleeper_matchups'] == 26


def test_a_second_load_only_fetches_what_can_still_change(conn):
    load(conn, FakeSleeper(sleeper_routes()))
    api = FakeSleeper(sleeper_routes())
    landed, logs = load(conn, api)

    assert landed == Counter()  # nothing changed, so nothing was added
    assert fetched(api, '/league/L25/') == []  # finished, and already landed
    assert fetched(api, '/league/L26/matchups/') == ['/league/L26/matchups/7', '/league/L26/matchups/8']
    assert fetched(api, '/league/L26/transactions/') == ['/league/L26/transactions/7', '/league/L26/transactions/8']
    assert '/league/L26/rosters' in api.paths  # rosters change every week
    assert '/players/nfl' not in api.paths
    assert any('Players were fetched' in line for line in logs)


def test_a_stat_correction_lands_a_new_version(conn):
    load(conn, FakeSleeper(sleeper_routes()))
    routes = sleeper_routes()
    routes['/league/L26/matchups/7'] = matchup(111.4)
    landed, _ = load(conn, FakeSleeper(routes))

    assert landed == Counter({'sleeper_matchups': 1})
    versions = conn.execute(
        "SELECT payload -> 0 -> 'points' FROM raw.sleeper_matchups WHERE league_id = 'L26' AND week = 7 ORDER BY id"
    ).fetchall()
    assert [v[0] for v in versions] == [107.0, 111.4]


def test_a_week_that_failed_to_land_is_fetched_next_time(conn):
    routes = sleeper_routes()
    load(conn, FakeSleeper(routes))
    conn.execute("DELETE FROM raw.sleeper_matchups WHERE league_id = 'L25' AND week = 5")
    conn.commit()
    api = FakeSleeper(routes)
    load(conn, api)
    assert fetched(api, '/league/L25/matchups/') == ['/league/L25/matchups/5']


def test_refetch_fetches_finished_leagues_again(conn):
    load(conn, FakeSleeper(sleeper_routes()))
    api = FakeSleeper(sleeper_routes())
    load(conn, api, refetch=True)
    assert len(fetched(api, '/league/L25/matchups/')) == 18
    assert '/league/L25/rosters' in api.paths


def test_an_unknown_username_is_skipped(conn):
    landed, logs = load(conn, FakeSleeper(sleeper_routes()), usernames=['nobody', 'colin'])
    assert "No Sleeper user named 'nobody', skipped" in logs
    assert landed['sleeper_leagues'] == 3


def test_a_failed_run_is_recorded_and_keeps_the_leagues_it_finished(conn):
    class Failing(FakeSleeper):
        def get(self, path):
            if path == '/league/L26/matchups/3':
                raise RuntimeError('Sleeper /league/L26/matchups/3 returned HTTP 500')
            return super().get(path)

    with pytest.raises(RuntimeError):
        load(conn, Failing(sleeper_routes()))

    status, error = conn.execute('SELECT status, error FROM raw.load_runs').fetchone()
    assert status == 'failed' and 'HTTP 500' in error
    assert count(conn, 'sleeper_matchups', league_id='L25') == 18  # finished before the failure
    assert count(conn, 'sleeper_matchups', league_id='L26') == 0  # rolled back with its league

    # Players weren't fetched by a successful run, so the next load gets them.
    api = FakeSleeper(sleeper_routes())
    load(conn, api)
    assert '/players/nfl' in api.paths


def test_two_loads_cannot_run_at_once(conn):
    from loader.load import LoadAlreadyRunning
    from loader.raw import LOCK_ID

    with psycopg.connect(conn.info.dsn, password='ffd_dev_password', autocommit=True) as other:
        other.execute('SELECT pg_advisory_lock(%s)', (LOCK_ID,))
        with pytest.raises(LoadAlreadyRunning):
            load(conn, FakeSleeper(sleeper_routes()))
    assert count(conn, 'load_runs') == 0


@pytest.fixture
def app(make_db):
    """The app's tables the loader reads, as the app's migrations create them."""
    with psycopg.connect(make_db()) as db:
        db.execute("""
          CREATE TABLE league_snapshots (id serial PRIMARY KEY, platform text NOT NULL, league_id text NOT NULL,
            league_name text NOT NULL, season text NOT NULL, week integer NOT NULL, points double precision NOT NULL,
            captured_at timestamptz NOT NULL DEFAULT now());
          CREATE TABLE live_events (id serial PRIMARY KEY, season text NOT NULL, week integer NOT NULL,
            at timestamptz NOT NULL DEFAULT now(), event jsonb NOT NULL);
          CREATE TABLE league_sources (id serial PRIMARY KEY, platform text NOT NULL, value text NOT NULL);
          INSERT INTO league_snapshots (platform, league_id, league_name, season, week, points)
            VALUES ('sleeper', 'L26', 'Dynasty', '2026', 7, 107.0), ('ffpc', 'F1', 'FFPC Main', '2026', 7, 131.2);
          INSERT INTO live_events (season, week, event) VALUES ('2026', 8, '{"player": "Patrick Mahomes", "points": 4}');
          INSERT INTO league_sources (platform, value) VALUES ('sleeper', 'colin'), ('espn', '123456'), ('sleeper', 'colin2');
        """)
        db.commit()
        yield db


def test_the_apps_history_and_live_feed_are_copied(conn, app):
    landed, _ = load(conn, FakeSleeper(sleeper_routes()), app)
    assert landed['app_league_snapshots'] == 2
    assert landed['app_live_events'] == 1
    snapshot = conn.execute("SELECT payload FROM raw.app_league_snapshots WHERE platform = 'ffpc'").fetchone()[0]
    assert snapshot['points'] == 131.2 and snapshot['league_name'] == 'FFPC Main'

    # The app overwrites a week's row as the week plays out; each version is kept.
    app.execute("UPDATE league_snapshots SET points = 109.5 WHERE league_id = 'L26'")
    app.commit()
    landed, _ = load(conn, FakeSleeper(sleeper_routes()), app)
    assert landed['app_league_snapshots'] == 1 and 'app_live_events' not in landed
    assert app.info.transaction_status == psycopg.pq.TransactionStatus.IDLE  # left nothing open


def test_sleeper_accounts_added_in_the_app_are_found(app):
    assert app_sleeper_usernames(app) == ['colin', 'colin2']


def test_an_app_database_without_the_tables_has_no_accounts(make_db):
    with psycopg.connect(make_db()) as empty:
        assert app_sleeper_usernames(empty) == []
