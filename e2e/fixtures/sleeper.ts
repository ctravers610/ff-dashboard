// What the Sleeper API would return for one account in one league.
// Shapes are checked against the API's own Sleeper types at compile time.

import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayerMap,
  SleeperRoster,
  SleeperUser,
} from '../../apps/api/src/adapters/sleeper/types.js';
import { ALL_PLAYERS, PLAYERS as P, SEASON, WEEK, type FxPlayer } from './players.js';
import { SLEEPER_FAAB } from './waivers.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

export const SLEEPER_USERNAME = 'e2e_user';
export const SLEEPER_LEAGUE_ID = 'SLP1';
export const SLEEPER_LEAGUE_NAME = 'E2E Sleeper League';
export const SLEEPER_MY_TEAM = 'Gridiron Gang';
export const SLEEPER_OPP_TEAM = 'Blitz Brigade';

export const state = { season: SEASON, week: WEEK, season_type: 'regular' };

export const user: SleeperUser = { user_id: 'u1', username: SLEEPER_USERNAME, display_name: 'E2E Manager', avatar: null };

// A second real account with no leagues this season, for adding accounts in the app.
export const FRIEND_USERNAME = 'e2e_friend';
export const friend: SleeperUser = { user_id: 'u9', username: FRIEND_USERNAME, display_name: 'E2E Friend', avatar: null };

export const league: SleeperLeague = {
  league_id: SLEEPER_LEAGUE_ID,
  name: SLEEPER_LEAGUE_NAME,
  season: SEASON,
  status: 'in_season',
  total_rosters: 4,
  roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'IR'],
  scoring_settings: { pass_yd: 0.04, pass_td: 4, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6, fgm: 3, xpm: 1, sack: 1, int: 2 },
  settings: { waiver_type: 2, waiver_budget: SLEEPER_FAAB.budget }, // FAAB
};

const owners: SleeperUser[] = [
  { ...user, metadata: { team_name: SLEEPER_MY_TEAM } },
  { user_id: 'u2', username: 'blitz', display_name: 'Rival One', avatar: null, metadata: { team_name: SLEEPER_OPP_TEAM } },
  { user_id: 'u3', username: 'third', display_name: 'Third Owner', avatar: null, metadata: { team_name: 'Third Wheel' } },
  { user_id: 'u4', username: 'fourth', display_name: 'Fourth Owner', avatar: null, metadata: { team_name: 'Cellar Dwellers' } },
];
export const users = owners;

// Starters follow roster_positions order: QB, RB, RB, WR, WR, TE, FLEX, K, DEF.
const MY_STARTERS: FxPlayer[] = [P.allen, P.bijan, P.cook, P.nabers, P.puka, P.bowers, P.waddle, P.little, P.bufDef];
const OPP_STARTERS: FxPlayer[] = [P.mahomes, P.henry, P.saquon, P.higgins, P.evans, P.kelce, P.hall, P.pineiro, P.seaDef];
const MY_BENCH: FxPlayer[] = [P.najee, P.maye];
const MY_IR: FxPlayer[] = [P.brooks];

const ids = (ps: FxPlayer[]) => ps.map((x) => x.id);
const rosterOf = (id: number, owner: string, starters: FxPlayer[], rest: FxPlayer[], record: [number, number], fpts: number, reserve: FxPlayer[] = []): SleeperRoster => ({
  roster_id: id,
  owner_id: owner,
  co_owners: null,
  starters: ids(starters),
  players: ids([...starters, ...rest, ...reserve]),
  reserve: ids(reserve),
  settings: { wins: record[0], losses: record[1], ties: 0, fpts: Math.floor(fpts), fpts_decimal: Math.round((fpts % 1) * 100), fpts_against: 500, fpts_against_decimal: 0 },
});

const withWaivers = (r: SleeperRoster): SleeperRoster => ({
  ...r,
  settings: { ...r.settings, waiver_budget_used: SLEEPER_FAAB.used, waiver_position: SLEEPER_FAAB.position },
});

export const rosters: SleeperRoster[] = [
  withWaivers(rosterOf(1, 'u1', MY_STARTERS, MY_BENCH, [3, 2], 620.5, MY_IR)),
  rosterOf(2, 'u2', OPP_STARTERS, [], [2, 3], 560.25),
  rosterOf(3, 'u3', [], [], [4, 1], 700),
  rosterOf(4, 'u4', [], [], [1, 4], 480),
];

// Week 6 is in progress: starters' points are given so the matchup totals add up exactly.
export const MY_STARTER_POINTS = [20.5, 14, 9.5, 12.3, 8.2, 11, 6.4, 7, 5];
export const OPP_STARTER_POINTS = [12.1, 8, 15.2, 6.5, 9.9, 4.4, 2, 8, 3];
export const SLEEPER_ME_POINTS = sum(MY_STARTER_POINTS); // 93.90
export const SLEEPER_OPP_POINTS = sum(OPP_STARTER_POINTS); // 69.10

// Finished weeks 1-5: [my points, opponent points]. Results: W L W W L.
export const SLEEPER_PAST: [number, number][] = [
  [130.5, 110],
  [98.2, 120.3],
  [122.4, 100.1],
  [140.7, 99.9],
  [101.1, 118.8],
];

export function matchups(week: number): SleeperMatchup[] {
  if (week === WEEK) {
    return [
      { roster_id: 1, matchup_id: 1, points: SLEEPER_ME_POINTS, starters: ids(MY_STARTERS), starters_points: MY_STARTER_POINTS },
      { roster_id: 2, matchup_id: 1, points: SLEEPER_OPP_POINTS, starters: ids(OPP_STARTERS), starters_points: OPP_STARTER_POINTS },
      { roster_id: 3, matchup_id: 2, points: 88, starters: [], starters_points: [] },
      { roster_id: 4, matchup_id: 2, points: 71, starters: [], starters_points: [] },
    ];
  }
  const past = SLEEPER_PAST[week - 1];
  if (!past) return [];
  return [
    { roster_id: 1, matchup_id: 1, points: past[0], starters: [], starters_points: [] },
    { roster_id: 2, matchup_id: 1, points: past[1], starters: [], starters_points: [] },
    { roster_id: 3, matchup_id: 2, points: 90, starters: [], starters_points: [] },
    { roster_id: 4, matchup_id: 2, points: 80, starters: [], starters_points: [] },
  ];
}

// Sleeper's /players/nfl: every player in the pool, keyed by id.
export const playersMap: SleeperPlayerMap = Object.fromEntries(
  ALL_PLAYERS.map((x) => [x.id, { name: x.name, position: x.position, team: x.team, injury_status: x.injury ?? null }]),
);
// The real endpoint uses full_name; the API client reads that field.
export const playersRaw = Object.fromEntries(
  ALL_PLAYERS.map((x) => [
    x.id,
    { full_name: x.name, position: x.position, team: x.team, injury_status: x.injury ?? null },
  ]),
);
