import psycopg
import pytest

from loader.raw import create_schema, ensure_database, land, land_many, payload_hash


def start_run(conn) -> int:
    return conn.execute('INSERT INTO raw.load_runs DEFAULT VALUES RETURNING run_id').fetchone()[0]


def rows(conn, table):
    return conn.execute(f'SELECT payload, run_id FROM raw.{table} ORDER BY id').fetchall()


def test_an_unchanged_payload_is_not_landed_again(conn):
    run = start_run(conn)
    key = {'league_id': 'L1', 'week': 3}
    with conn.cursor() as cur:
        assert land(cur, 'sleeper_matchups', key, [{'roster_id': 1, 'points': 101.5}], run)
        assert not land(cur, 'sleeper_matchups', key, [{'points': 101.5, 'roster_id': 1}], run)  # same JSON, keys reordered
    assert len(rows(conn, 'sleeper_matchups')) == 1


def test_a_changed_payload_is_kept_as_a_new_version(conn):
    first, second = start_run(conn), start_run(conn)
    key = {'league_id': 'L1', 'week': 3}
    with conn.cursor() as cur:
        land(cur, 'sleeper_matchups', key, [{'points': 101.5}], first)
        assert land(cur, 'sleeper_matchups', key, [{'points': 104.2}], second)  # a stat correction
        # Going back to an earlier version is a change too.
        assert land(cur, 'sleeper_matchups', key, [{'points': 101.5}], second)
    assert [r[0][0]['points'] for r in rows(conn, 'sleeper_matchups')] == [101.5, 104.2, 101.5]


def test_items_are_versioned_separately(conn):
    run = start_run(conn)
    with conn.cursor() as cur:
        land(cur, 'sleeper_matchups', {'league_id': 'L1', 'week': 1}, [], run)
        assert land(cur, 'sleeper_matchups', {'league_id': 'L1', 'week': 2}, [], run)
        assert land(cur, 'sleeper_matchups', {'league_id': 'L2', 'week': 1}, [], run)


def test_a_table_without_keys_has_one_item(conn):
    run = start_run(conn)
    with conn.cursor() as cur:
        assert land(cur, 'sleeper_state', {}, {'week': 8}, run)
        assert not land(cur, 'sleeper_state', {}, {'week': 8}, run)
        assert land(cur, 'sleeper_state', {}, {'week': 9}, run)


def test_land_many_counts_only_the_rows_it_added(conn):
    run = start_run(conn)
    with conn.cursor() as cur:
        land(cur, 'sleeper_players', {'player_id': '4046'}, {'team': 'KC'}, run)
        added = land_many(cur, 'sleeper_players', [
            ({'player_id': '4046'}, {'team': 'KC'}),  # unchanged
            ({'player_id': '4034'}, {'team': 'SF'}),
            ({'player_id': '6794'}, {'team': 'MIN'}),
        ], run)
    assert added == 2
    assert land_many(conn.cursor(), 'sleeper_players', [], run) == 0


def test_the_key_must_match_the_table(conn):
    with pytest.raises(ValueError, match='keyed by'):
        land(conn.cursor(), 'sleeper_matchups', {'league_id': 'L1'}, [], start_run(conn))


def test_creating_the_schema_again_changes_nothing(conn):
    run = start_run(conn)
    land(conn.cursor(), 'sleeper_leagues', {'league_id': 'L1'}, {'name': 'Dynasty'}, run)
    conn.commit()
    create_schema(conn)
    assert len(rows(conn, 'sleeper_leagues')) == 1


def test_the_hash_ignores_key_order_but_not_values():
    assert payload_hash({'a': 1, 'b': [1, 2]}) == payload_hash({'b': [1, 2], 'a': 1})
    assert payload_hash({'a': [1, 2]}) != payload_hash({'a': [2, 1]})


def test_ensure_database_creates_a_missing_database(make_db, admin):
    url = make_db()
    assert not ensure_database(url)  # already there

    missing = url + '_new'
    try:
        assert ensure_database(missing)
        psycopg.connect(missing).close()
    finally:
        admin.execute(f'DROP DATABASE IF EXISTS {missing.rsplit("/", 1)[1]} WITH (FORCE)')
