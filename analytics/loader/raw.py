"""The raw schema: what each source returned, exactly as returned.

Every landed table has the same shape: the columns that identify one item (a
league, a league's week), the payload as JSON, and a hash of it. A row is only
added when the payload differs from the latest one for that item, so loading
again is safe and the table keeps every version the source has had.
"""

import hashlib
import json
from typing import Any, Iterable

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

# Each landed table and the columns that identify one item in it.
TABLES: dict[str, tuple[str, ...]] = {
    'sleeper_state': (),  # the NFL season and week, as Sleeper sees them
    'sleeper_users': ('user_id',),
    'sleeper_leagues': ('league_id',),
    'sleeper_league_users': ('league_id',),  # everyone in the league
    'sleeper_rosters': ('league_id',),
    'sleeper_matchups': ('league_id', 'week'),
    'sleeper_transactions': ('league_id', 'week'),
    'sleeper_drafts': ('league_id',),
    'sleeper_draft_picks': ('draft_id',),
    'sleeper_players': ('player_id',),  # one row per player, not the 5 MB response
    'app_league_snapshots': ('platform', 'league_id', 'season', 'week'),
    'app_live_events': ('event_id',),
}
KEY_TYPES = {'week': 'integer', 'event_id': 'bigint'}  # everything else is text

LOCK_ID = 7_463_001  # pg advisory lock held while a load runs, so two can't overlap

RUNS_DDL = """
CREATE SCHEMA IF NOT EXISTS raw;
CREATE TABLE IF NOT EXISTS raw.load_runs (
  run_id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running', -- running | succeeded | failed
  options jsonb NOT NULL DEFAULT '{}',
  players_fetched boolean NOT NULL DEFAULT false,
  rows_landed jsonb,
  api_calls integer,
  error text
);
"""


def ensure_database(url: str) -> bool:
    """Creates the database in url if it doesn't exist yet. True if it was created."""
    try:
        psycopg.connect(url, connect_timeout=10).close()
        return False
    except psycopg.OperationalError as e:
        if 'does not exist' not in str(e):
            raise
    name = psycopg.conninfo.conninfo_to_dict(url)['dbname']
    admin_url = psycopg.conninfo.make_conninfo(url, dbname='postgres')
    with psycopg.connect(admin_url, autocommit=True) as admin:
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    return True


def create_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(RUNS_DDL)
        for table, keys in TABLES.items():
            key_columns = ''.join(f'{k} {KEY_TYPES.get(k, "text")} NOT NULL, ' for k in keys)
            cur.execute(
                f"""CREATE TABLE IF NOT EXISTS raw.{table} (
                  id bigserial PRIMARY KEY,
                  {key_columns}
                  payload jsonb NOT NULL,
                  payload_hash text NOT NULL,
                  run_id bigint NOT NULL REFERENCES raw.load_runs,
                  loaded_at timestamptz NOT NULL DEFAULT now()
                )"""
            )
            if keys:  # finds an item's latest version
                cur.execute(f'CREATE INDEX IF NOT EXISTS {table}_item_idx ON raw.{table} ({", ".join(keys)}, id)')
    conn.commit()


def payload_hash(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _insert_if_changed(table: str) -> str:
    keys = TABLES[table]
    match = ' AND '.join(f'{k} = %({k})s' for k in keys) or 'TRUE'
    columns = ', '.join((*keys, 'payload', 'payload_hash', 'run_id'))
    values = ', '.join(f'%({c})s' for c in (*keys, 'payload', 'hash', 'run_id'))
    return f"""
      INSERT INTO raw.{table} ({columns})
      SELECT {values}
      WHERE (SELECT payload_hash FROM raw.{table} WHERE {match} ORDER BY id DESC LIMIT 1)
            IS DISTINCT FROM %(hash)s
    """


def _params(table: str, key: dict[str, Any], payload: Any, run_id: int) -> dict[str, Any]:
    if set(key) != set(TABLES[table]):
        raise ValueError(f'raw.{table} is keyed by {TABLES[table]}, got {tuple(key)}')
    return {**key, 'payload': Jsonb(payload), 'hash': payload_hash(payload), 'run_id': run_id}


def land(cur: psycopg.Cursor, table: str, key: dict[str, Any], payload: Any, run_id: int) -> bool:
    """Adds payload for this item unless it's unchanged. True if a row was added."""
    cur.execute(_insert_if_changed(table), _params(table, key, payload, run_id))
    return cur.rowcount == 1


def land_many(cur: psycopg.Cursor, table: str, items: Iterable[tuple[dict[str, Any], Any]], run_id: int) -> int:
    """land() for many items in one round trip. Returns how many rows were added."""
    params = [_params(table, key, payload, run_id) for key, payload in items]
    if not params:
        return 0
    cur.executemany(_insert_if_changed(table), params)
    return cur.rowcount


def has_rows(cur: psycopg.Cursor, table: str, key: dict[str, Any]) -> bool:
    match = ' AND '.join(f'{k} = %({k})s' for k in key)
    cur.execute(f'SELECT EXISTS (SELECT 1 FROM raw.{table} WHERE {match})', key)
    return cur.fetchone()[0]


def landed_weeks(cur: psycopg.Cursor, table: str, league_id: str) -> set[int]:
    cur.execute(f'SELECT DISTINCT week FROM raw.{table} WHERE league_id = %s', (league_id,))
    return {row[0] for row in cur.fetchall()}
