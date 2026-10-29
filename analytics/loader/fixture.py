"""python -m loader.fixture: loads a made-up Sleeper league instead of real data.

For CI and the published docs site, where the warehouse needs data that is
realistic enough for every dbt test to check something, but nobody's real
league. Two seasons of one four-team league: 2025 finished, 2026 in week 4
(weeks 1-3 final, week 4 half played). Managers sometimes start the wrong
players, claims win and fail, there's a trade, and one lineup has an empty
slot. Always the same data (fixed seed).
"""

import random
import sys
from datetime import date, datetime, time, timedelta, timezone

import psycopg

from .config import load_config
from .load import run_load
from .raw import create_schema, ensure_database

SEASONS = (
    # league_id, season, previous league, status, weeks played, plays the median
    ('FX2025', 2025, None, 'complete', 17, False),
    ('FX2026', 2026, 'FX2025', 'in_season', 4, True),
)
CURRENT_WEEK = 4  # 2026, half played
KICKOFF = {2025: date(2025, 9, 4), 2026: date(2026, 9, 9)}

SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF']
BENCH = 3
ROSTER = {'QB': 1, 'RB': 3, 'WR': 4, 'TE': 2, 'K': 1, 'DEF': 1}  # 12: the 9 starters and 3 bench
POOL = {'QB': 6, 'RB': 16, 'WR': 20, 'TE': 10, 'K': 6, 'DEF': 6}  # what's left is free agents
MEAN = {'QB': 18, 'RB': 11, 'WR': 10, 'TE': 7, 'K': 8, 'DEF': 7}
NFL_TEAMS = ['KC', 'BUF', 'SF', 'PHI', 'DAL', 'MIA', 'DET', 'BAL']
MANAGERS = [('fx_me', 'Fixture Me'), ('fx_ana', 'Ana'), ('fx_ben', 'Ben'), ('fx_cal', 'Cal')]
USERNAME = 'fx_me'
PAIRINGS = [[(1, 2), (3, 4)], [(1, 3), (2, 4)], [(1, 4), (2, 3)]]


def _epoch_ms(day: date, hour: int = 9) -> int:
    return int(datetime.combine(day, time(hour), timezone.utc).timestamp() * 1000)


def _players() -> dict:
    players = {}
    for position, count in POOL.items():
        for i in range(count):
            team = NFL_TEAMS[i % len(NFL_TEAMS)]
            player_id = team if position == 'DEF' else str(1000 + len(players))
            name = f'{team} Defense' if position == 'DEF' else f'Fixture {position}{i + 1}'
            players[player_id] = {
                'player_id': player_id,
                'full_name': name,
                'first_name': name.split()[0],
                'last_name': name.split()[-1],
                'position': position,
                'fantasy_positions': [position],
                'team': team,
                'status': 'Active',
                'active': True,
                'injury_status': 'Questionable' if i == 2 and position == 'WR' else None,
                'years_exp': i % 9,
                'age': 22 + i % 12,
            }
    return players


def _lineup(roster: list[str], players: dict, projected: dict) -> list[str]:
    """What a manager starts: the best by his own (imperfect) projections."""
    starters, used = [], set()
    for slot in SLOTS:
        eligible = ['RB', 'WR', 'TE'] if slot == 'FLEX' else [slot]
        options = [p for p in roster if p not in used and players[p]['position'] in eligible]
        pick = max(options, key=lambda p: projected[p], default='0')
        used.add(pick)
        starters.append(pick)
    return starters


def _league(rng: random.Random, players: dict, league_id: str, season: int, previous: str | None,
            status: str, weeks: int, median: bool) -> dict:
    routes = {}
    by_position = {pos: [p for p, info in players.items() if info['position'] == pos] for pos in POOL}
    for ids in by_position.values():
        rng.shuffle(ids)

    # The draft: each team takes its roster, position by position, in snake order.
    rosters = {r: [] for r in range(1, 5)}
    picks, pick_no = [], 0
    for round_no, (position, count) in enumerate((pos, n) for pos, n in ROSTER.items() for _ in range(n)):
        order = list(range(1, 5)) if round_no % 2 == 0 else list(range(4, 0, -1))
        for roster_id in order:
            player_id = by_position[position].pop()
            rosters[roster_id].append(player_id)
            pick_no += 1
            picks.append({
                'draft_id': f'D{league_id}', 'pick_no': pick_no, 'round': round_no + 1, 'draft_slot': roster_id,
                'roster_id': roster_id, 'picked_by': f'fxu{roster_id}', 'player_id': player_id, 'is_keeper': None,
                'metadata': {'position': position, 'team': players[player_id]['team']},
            })
    free_agents = [p for ids in by_position.values() for p in ids]

    record = {r: {'wins': 0, 'losses': 0, 'ties': 0, 'fpts': 0.0} for r in rosters}
    for week in range(1, weeks + 1):
        week_start = KICKOFF[season] + timedelta(days=7 * (week - 1) - 1)
        transactions = []

        if week > 1:
            # A waiver claim each week: one team wins a free agent, another's bid fails.
            winner, loser = (week % 4) + 1, ((week + 1) % 4) + 1
            bench = [p for p in rosters[winner] if players[p]['position'] in ('RB', 'WR')]
            dropped = min(bench, key=lambda p: rng.random())
            added = next(p for p in free_agents if players[p]['position'] == players[dropped]['position'])
            bid = rng.randint(1, 30)
            for n, (roster_id, outcome, amount) in enumerate(((winner, 'complete', bid), (loser, 'failed', bid - 1))):
                transactions.append({
                    'transaction_id': f'{league_id}-{week}-w{n}', 'type': 'waiver', 'status': outcome, 'leg': week,
                    'created': _epoch_ms(week_start), 'status_updated': _epoch_ms(week_start + timedelta(days=1), 7),
                    'creator': f'fxu{roster_id}', 'roster_ids': [roster_id], 'settings': {'waiver_bid': max(amount, 0)},
                    'adds': {added: roster_id}, 'drops': {dropped: roster_id} if outcome == 'complete' else None,
                    'metadata': None if outcome == 'complete' else {'notes': 'Another team had a higher bid.'},
                    'draft_picks': [], 'waiver_budget': [],
                })
            rosters[winner].remove(dropped)
            rosters[winner].append(added)
            free_agents.remove(added)
            free_agents.append(dropped)

        if week == 3:
            # A trade: teams 1 and 2 swap a WR, and team 2 sends $5 of FAAB.
            give = next(p for p in rosters[1] if players[p]['position'] == 'WR')
            get = next(p for p in rosters[2] if players[p]['position'] == 'WR')
            rosters[1][rosters[1].index(give)] = get
            rosters[2][rosters[2].index(get)] = give
            transactions.append({
                'transaction_id': f'{league_id}-{week}-t', 'type': 'trade', 'status': 'complete', 'leg': week,
                'created': _epoch_ms(week_start, 20), 'status_updated': _epoch_ms(week_start + timedelta(days=1), 20),
                'creator': 'fxu1', 'roster_ids': [1, 2], 'adds': {get: 1, give: 2}, 'drops': {give: 1, get: 2},
                'settings': None, 'metadata': None, 'draft_picks': [],
                'waiver_budget': [{'sender': 2, 'receiver': 1, 'amount': 5}],
            })

        in_progress = season == 2026 and week == CURRENT_WEEK
        points = {}
        for player_id, info in players.items():
            scored = max(0.0, rng.gauss(MEAN[info['position']], 6))
            points[player_id] = round(scored / 2 if in_progress else scored, 2)
        projected = {p: points[p] + rng.gauss(0, 6) for p in players}

        playoffs = week >= 15
        pairs = [(1, 2)] if playoffs else PAIRINGS[(week - 1) % 3]
        matchup_of = {r: n + 1 for n, pair in enumerate(pairs) for r in pair}
        teams = []
        for roster_id, roster in rosters.items():
            starters = _lineup(roster, players, projected)
            if season == 2026 and week == 2 and roster_id == 4:
                starters[SLOTS.index('K')] = '0'  # forgot to set a kicker
            starter_points = [points.get(p, 0.0) for p in starters]
            teams.append({
                'roster_id': roster_id, 'matchup_id': matchup_of.get(roster_id), 'custom_points': None,
                'points': round(sum(starter_points), 2), 'starters': starters, 'starters_points': starter_points,
                'players': list(roster), 'players_points': {p: points[p] for p in roster},
            })
        routes[f'/league/{league_id}/matchups/{week}'] = teams
        routes[f'/league/{league_id}/transactions/{week}'] = transactions

        if not in_progress and not playoffs:
            score = {t['roster_id']: t['points'] for t in teams}
            for a, b in pairs:
                record[a]['fpts'] += score[a]
                record[b]['fpts'] += score[b]
                if score[a] == score[b]:
                    record[a]['ties'] += 1
                    record[b]['ties'] += 1
                else:
                    winner, loser = (a, b) if score[a] > score[b] else (b, a)
                    record[winner]['wins'] += 1
                    record[loser]['losses'] += 1

    routes[f'/league/{league_id}/users'] = [
        {'user_id': f'fxu{n + 1}', 'display_name': display, 'is_owner': n == 0, 'league_id': league_id,
         'metadata': {'team_name': f"{display}'s Team"}}
        for n, (_, display) in enumerate(MANAGERS)
    ]
    routes[f'/league/{league_id}/rosters'] = [
        {'roster_id': r, 'owner_id': f'fxu{r}', 'co_owners': None, 'league_id': league_id, 'players': roster,
         'starters': routes[f'/league/{league_id}/matchups/{weeks}'][r - 1]['starters'], 'reserve': None, 'taxi': None,
         'settings': {'wins': record[r]['wins'], 'losses': record[r]['losses'], 'ties': record[r]['ties'],
                      'fpts': int(record[r]['fpts']), 'fpts_decimal': round(record[r]['fpts'] % 1 * 100)},
         'metadata': None}
        for r, roster in rosters.items()
    ]
    routes[f'/league/{league_id}/drafts'] = [{
        'draft_id': f'D{league_id}', 'league_id': league_id, 'season': str(season), 'type': 'snake',
        'status': 'complete', 'start_time': _epoch_ms(KICKOFF[season] - timedelta(days=10), 0),
        'settings': {'rounds': sum(ROSTER.values()), 'teams': 4}, 'metadata': {'scoring_type': 'ppr'},
        'draft_order': {f'fxu{r}': r for r in range(1, 5)},
    }]
    routes[f'/draft/D{league_id}/picks'] = picks
    routes['league'] = {
        'league_id': league_id, 'name': 'Fixture League', 'season': str(season), 'status': status,
        'total_rosters': 4, 'previous_league_id': previous, 'draft_id': f'D{league_id}',
        'roster_positions': SLOTS + ['BN'] * BENCH, 'scoring_settings': {'rec': 1.0, 'pass_td': 4.0},
        'settings': {'type': 0, 'waiver_type': 2, 'waiver_budget': 100, 'playoff_week_start': 15, 'playoff_teams': 2,
                     'league_average_match': 1 if median else 0, 'start_week': 1, 'trade_deadline': 11, 'best_ball': 0},
    }
    return routes


def build_routes(seed: int = 2026) -> dict:
    """Every Sleeper path the loader asks for, and what the fixture league answers."""
    rng = random.Random(seed)
    players = _players()
    routes = {
        '/state/nfl': {'season': '2026', 'league_season': '2026', 'week': CURRENT_WEEK, 'display_week': CURRENT_WEEK,
                       'season_type': 'regular', 'season_start_date': KICKOFF[2026].isoformat()},
        f'/user/{USERNAME}': {'user_id': 'fxu1', 'username': USERNAME, 'display_name': MANAGERS[0][1]},
        '/players/nfl': players,
    }
    for league_id, season, previous, status, weeks, median in SEASONS:
        league_routes = _league(rng, players, league_id, season, previous, status, weeks, median)
        routes[f'/user/fxu1/leagues/nfl/{season}'] = [league_routes.pop('league')]
        routes.update(league_routes)
    return routes


class FixtureSleeper:
    """Stands in for loader.sleeper.Sleeper, answering from build_routes()."""

    def __init__(self, routes: dict | None = None):
        self.routes = build_routes() if routes is None else routes
        self.calls = 0

    def get(self, path: str):
        self.calls += 1
        return self.routes.get(path)


def main() -> int:
    cfg = load_config()
    ensure_database(cfg.analytics_url)
    api = FixtureSleeper()
    with psycopg.connect(cfg.analytics_url) as conn:
        create_schema(conn)
        landed = run_load(conn, api, None, [USERNAME], first_season=2025)
    print(f'Fixture league loaded: {sum(landed.values())} rows')
    return 0


if __name__ == '__main__':
    sys.exit(main())
