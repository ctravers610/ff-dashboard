from loader.fixture import USERNAME, FixtureSleeper, build_routes
from loader.load import run_load


def test_the_fixture_league_is_the_same_every_time():
    assert build_routes() == build_routes()


def test_each_team_scores_its_starters_points():
    routes = build_routes()
    weeks = [teams for path, teams in routes.items() if '/matchups/' in path]
    assert weeks
    for teams in weeks:
        for team in teams:
            assert team['points'] == round(sum(team['starters_points']), 2)
            assert set(team['starters']) - {'0'} <= set(team['players'])


def test_the_fixture_loads_both_seasons(conn):
    landed = run_load(conn, FixtureSleeper(), None, [USERNAME], first_season=2025, log=lambda _: None)
    assert landed['sleeper_leagues'] == 2
    assert landed['sleeper_matchups'] == 18 + 4  # every 2025 week to 18, and 2026 to week 4
    assert landed['sleeper_draft_picks'] == 2
