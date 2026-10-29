# Database tests get their own throwaway database, created for each test and
# dropped after it, so they never touch the data in your analytics database.

import copy
import os
import secrets

import psycopg
import pytest

from loader.raw import create_schema

SERVER = os.environ.get('TEST_DATABASE_SERVER', 'postgres://ffd:ffd_dev_password@127.0.0.1:5432')


def _server_available() -> bool:
    try:
        psycopg.connect(f'{SERVER}/postgres', connect_timeout=2).close()
        return True
    except psycopg.OperationalError:
        return False


@pytest.fixture(scope='session')
def admin():
    if not _server_available():
        if os.environ.get('CI'):
            pytest.fail(f'No Postgres at {SERVER}')
        pytest.skip('No Postgres running (start it with: docker compose up -d)')
    with psycopg.connect(f'{SERVER}/postgres', autocommit=True) as conn:
        yield conn


@pytest.fixture
def make_db(admin):
    """Creates empty databases on demand; returns their URLs."""
    names = []

    def make() -> str:
        name = f'ffd_analytics_test_{secrets.token_hex(4)}'  # generated, so safe to inline in SQL
        admin.execute(f'CREATE DATABASE {name}')
        names.append(name)
        return f'{SERVER}/{name}'

    yield make
    for name in names:
        admin.execute(f'DROP DATABASE IF EXISTS {name} WITH (FORCE)')


@pytest.fixture
def conn(make_db):
    with psycopg.connect(make_db()) as c:
        create_schema(c)
        yield c


class FakeSleeper:
    """Answers from a dict of path → response, and records what was asked."""

    def __init__(self, routes: dict):
        self.routes = routes
        self.paths: list[str] = []

    @property
    def calls(self) -> int:
        return len(self.paths)

    def get(self, path: str):
        self.paths.append(path)
        return copy.deepcopy(self.routes.get(path))
