// A made-up Yahoo league, answered in the shape Yahoo's Fantasy API uses for
// ?format=json: resources are arrays of one-key objects, and collections are
// objects keyed "0", "1", ... plus a "count". No real Yahoo data is used anywhere
// in the tests (the API agreement keeps it out of storage and AI tools).

import { PLAYERS as P, SEASON, WEEK, type FxPlayer } from './players.js';

export const YAHOO_GAME_KEY = '461';
export const YAHOO_LEAGUE_ID = '777001';
export const YAHOO_LEAGUE_KEY = `${YAHOO_GAME_KEY}.l.${YAHOO_LEAGUE_ID}`;
export const YAHOO_TEAM_KEY = `${YAHOO_LEAGUE_KEY}.t.4`;
export const YAHOO_OPP_TEAM_KEY = `${YAHOO_LEAGUE_KEY}.t.9`;
export const YAHOO_LEAGUE_NAME = 'Made-Up Yahoo League';
export const YAHOO_MY_TEAM = 'Placeholder Punters';
export const YAHOO_OPP_TEAM = 'Imaginary Interceptors';
export const YAHOO_ME = { points: 88.4, projected: 104.2, record: [4, 2, 0] as const, rank: 3, pointsFor: 702.6, pointsAgainst: 650.1 };
export const YAHOO_OPP = { points: 71.9, projected: 95.0 };

// Your lineup: [player, Yahoo slot, points this week]. Waddle is Questionable;
// Higgins is Out and starting, with Doubs healthy on the bench.
export const YAHOO_LINEUP: [FxPlayer, string, number][] = [
  [P.allen, 'QB', 21.3],
  [P.bijan, 'RB', 14.0],
  [P.henry, 'RB', 9.6],
  [P.puka, 'WR', 8.2],
  [P.higgins, 'WR', 0],
  [P.kelce, 'TE', 6.1],
  [P.waddle, 'W/R/T', 4.8],
  [P.little, 'K', 8.0],
  [P.seaDef, 'DEF', 6.0],
  [P.doubs, 'BN', 11.2],
  [P.brooks, 'IR', 0],
];
const STATUS: Partial<Record<string, string>> = { [P.higgins.id]: 'O', [P.waddle.id]: 'Q', [P.brooks.id]: 'IR' };

/** Yahoo's one-key-object arrays: { a: 1, b: 2 } -> [{ a: 1 }, { b: 2 }]. */
const props = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => ({ [k]: v }));
/** Yahoo's collections: [x, y] -> { "0": { key: x }, "1": { key: y }, count: 2 }. */
const collection = (key: string, items: unknown[]) => ({ ...Object.fromEntries(items.map((item, i) => [String(i), { [key]: item }])), count: items.length });

const team = (key: string, name: string) => props({ team_key: key, team_id: key.split('.t.')[1], name, url: `https://football.fantasysports.yahoo.com/f1/${YAHOO_LEAGUE_ID}/${key.split('.t.')[1]}` });

export const userTeams = () => ({
  fantasy_content: {
    users: collection('user', [
      [{ guid: 'MADEUPGUID' }, { games: collection('game', [[{ game_key: YAHOO_GAME_KEY, code: 'nfl', season: SEASON }, { teams: collection('team', [[team(YAHOO_TEAM_KEY, YAHOO_MY_TEAM)]]) }]]) }],
    ]),
  },
});

export const userLeagues = () => ({
  fantasy_content: {
    users: collection('user', [
      [
        { guid: 'MADEUPGUID' },
        {
          games: collection('game', [
            [
              { game_key: YAHOO_GAME_KEY, code: 'nfl', season: SEASON },
              { leagues: collection('league', [props({ league_key: YAHOO_LEAGUE_KEY, league_id: YAHOO_LEAGUE_ID, name: YAHOO_LEAGUE_NAME, num_teams: 10, current_week: String(WEEK), season: SEASON })]) },
            ],
          ]),
        },
      ],
    ]),
  },
});

const side = (key: string, name: string, s: { points: number; projected: number }) => [
  team(key, name),
  { team_points: { coverage_type: 'week', week: String(WEEK), total: s.points.toFixed(2) }, team_projected_points: { coverage_type: 'week', week: String(WEEK), total: s.projected.toFixed(2) } },
];

export const matchups = () => ({
  fantasy_content: {
    team: [
      team(YAHOO_TEAM_KEY, YAHOO_MY_TEAM),
      {
        matchups: collection('matchup', [
          { week: String(WEEK), status: 'midevent', '0': { teams: collection('team', [side(YAHOO_TEAM_KEY, YAHOO_MY_TEAM, YAHOO_ME), side(YAHOO_OPP_TEAM_KEY, YAHOO_OPP_TEAM, YAHOO_OPP)]) } },
        ]),
      },
    ],
  },
});

const YAHOO_POSITION: Partial<Record<FxPlayer['position'], string>> = { DEF: 'DEF', K: 'K' };
const yahooPlayer = ([p, slot, points]: (typeof YAHOO_LINEUP)[number]) => [
  props({
    player_key: `${YAHOO_GAME_KEY}.p.${p.espnId}`,
    player_id: String(p.espnId),
    name: { full: p.name },
    editorial_team_abbr: p.team.charAt(0) + p.team.slice(1).toLowerCase(), // Yahoo writes "Buf", "LAR" as "Lar"
    display_position: YAHOO_POSITION[p.position] ?? p.position,
    ...(STATUS[p.id] ? { status: STATUS[p.id] } : {}),
  }),
  { selected_position: [{ coverage_type: 'week' }, { week: String(WEEK) }, { position: slot }] },
  { player_points: { coverage_type: 'week', week: String(WEEK), total: points.toFixed(2) } },
];

export const roster = () => ({
  fantasy_content: {
    team: [team(YAHOO_TEAM_KEY, YAHOO_MY_TEAM), { roster: { coverage_type: 'week', week: String(WEEK), '0': { players: collection('player', YAHOO_LINEUP.map(yahooPlayer)) } } }],
  },
});

export const standings = () => ({
  fantasy_content: {
    team: [
      team(YAHOO_TEAM_KEY, YAHOO_MY_TEAM),
      {
        team_standings: {
          rank: String(YAHOO_ME.rank),
          points_for: String(YAHOO_ME.pointsFor),
          points_against: String(YAHOO_ME.pointsAgainst),
          outcome_totals: { wins: String(YAHOO_ME.record[0]), losses: String(YAHOO_ME.record[1]), ties: String(YAHOO_ME.record[2]) },
        },
      },
    ],
  },
});
