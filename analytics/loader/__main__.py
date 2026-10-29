"""python -m loader: loads Sleeper and the app's history into the analytics database."""

import argparse
import sys

import psycopg

from .config import load_config
from .load import LoadAlreadyRunning, app_sleeper_usernames, run_load
from .raw import create_schema, ensure_database
from .sleeper import Sleeper


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='python -m loader', description=__doc__)
    parser.add_argument('--username', action='append', default=[],
                        help='Sleeper username to load (repeatable). Default: SLEEPER_USERNAMES plus accounts added in the app')
    parser.add_argument('--first-season', type=int, default=2017, help='earliest season to load (Sleeper fantasy began in 2017)')
    parser.add_argument('--refetch', action='store_true', help='fetch finished leagues and weeks again, too')
    parser.add_argument('--skip-players', action='store_true', help="don't fetch Sleeper's player list")
    parser.add_argument('--skip-app', action='store_true', help="don't read the app's database")
    args = parser.parse_args(argv)

    cfg = load_config()
    if ensure_database(cfg.analytics_url):
        print('Created the analytics database')

    app = None
    if not args.skip_app:
        try:
            app = psycopg.connect(cfg.app_url, connect_timeout=10)
        except psycopg.OperationalError as e:
            print(f"Couldn't reach the app's database, so its tables are skipped: {str(e).strip()}")

    usernames = args.username or list(dict.fromkeys(cfg.usernames + (app_sleeper_usernames(app) if app else [])))
    if not usernames:
        print('No Sleeper usernames: set SLEEPER_USERNAMES, add an account in the app, or pass --username')

    api = Sleeper(cfg.sleeper_api)
    try:
        with psycopg.connect(cfg.analytics_url) as conn:
            create_schema(conn)
            landed = run_load(conn, api, app, usernames, first_season=args.first_season,
                              refetch=args.refetch, players=not args.skip_players)
    except LoadAlreadyRunning as e:
        print(e)
        return 1
    finally:
        if app is not None:
            app.close()

    print(f'\n{api.calls} Sleeper calls. New rows:' if landed else f'\n{api.calls} Sleeper calls. Nothing new.')
    for table, count in sorted(landed.items()):
        print(f'  raw.{table}: {count}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
