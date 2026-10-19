// What ESPN's unofficial league API would return, using ESPN's numeric ids for
// positions, teams and lineup slots. Checked against the API's ESPN types.

import type { EspnLeague, EspnRosterEntry } from '../../apps/api/src/adapters/espn/types.js';
import { PLAYERS as P, SEASON, WEEK, type FxPlayer } from './players.js';
import { ESPN_FAAB, espnFreeAgents as FREE_AGENTS, espnWaiverStats } from './waivers.js';

export const ESPN_LEAGUE_ID = '900001';
export const ESPN_FAILING_LEAGUE_ID = '900002'; // always answers 401, to test error handling
export const ESPN_LEAGUE_NAME = 'E2E ESPN League';
export const ESPN_S2 = 'e2e-espn-s2-cookie';
export const ESPN_SWID = '{E2E-SWID-0001}';
export const ESPN_MY_TEAM = 'Waiver Wire Warriors';
export const ESPN_OPP_TEAM = 'Sunday Scaries';

const POSITION_ID = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 16 } as const;
const TEAM_ID: Record<string, number> = {
  ATL: 1, BUF: 2, CIN: 4, DEN: 7, KC: 12, LV: 13, LAR: 14, NE: 17, NO: 18, NYG: 19,
  NYJ: 20, PHI: 21, SEA: 26, SF: 25, CAR: 29, JAX: 30, BAL: 33, GB: 9, CHI: 3,
};
// ESPN lineup slot ids
const SLOT = { QB: 0, RB: 2, WR: 4, TE: 6, FLEX: 23, K: 17, DST: 16, BN: 20, IR: 21 } as const;

const entry = (p: FxPlayer, slot: number, actual: number, projected: number): EspnRosterEntry => ({
  playerId: p.espnId,
  lineupSlotId: slot,
  playerPoolEntry: {
    player: {
      id: p.espnId,
      fullName: p.position === 'DEF' ? `${p.team} D/ST` : p.name,
      defaultPositionId: POSITION_ID[p.position],
      proTeamId: TEAM_ID[p.team] ?? 0,
      injuryStatus: p.injury ? 'QUESTIONABLE' : 'ACTIVE',
      stats: [
        { scoringPeriodId: WEEK, statSourceId: 0, appliedTotal: actual },
        { scoringPeriodId: WEEK, statSourceId: 1, appliedTotal: projected },
        ...espnWaiverStats(p),
      ],
    },
  },
});

// [player, slot, actual points this week]. Projections are actual + 2, which the app does not use directly.
type Lineup = [FxPlayer, number, number][];
const MY_LINEUP: Lineup = [
  [P.maye, SLOT.QB, 18.4],
  [P.bijan, SLOT.RB, 15.2],
  [P.najee, SLOT.RB, 7.1],
  [P.nabers, SLOT.WR, 14.3],
  [P.reed, SLOT.WR, 10.6], // questionable, and his game hasn't started: an alert with a bench swap
  [P.kelce, SLOT.TE, 9.8],
  [P.puka, SLOT.FLEX, 12.2],
  [P.pineiro, SLOT.K, 8],
  [P.seaDef, SLOT.DST, 5],
  [P.higgins, SLOT.BN, 0],
  [P.evans, SLOT.BN, 0], // healthy, but his game is over: can't be swapped in
  [P.doubs, SLOT.BN, 0], // healthy and his game hasn't started: the suggested swap
];
const OPP_LINEUP: Lineup = [
  [P.allen, SLOT.QB, 21],
  [P.henry, SLOT.RB, 10.4],
  [P.saquon, SLOT.RB, 8.8],
  [P.waddle, SLOT.WR, 7.7],
  [P.higgins, SLOT.WR, 9.1],
  [P.bowers, SLOT.TE, 12],
  [P.cook, SLOT.FLEX, 11.2],
  [P.little, SLOT.K, 6],
  [P.bufDef, SLOT.DST, 4],
];

const entries = (lineup: Lineup) => lineup.map(([p, slot, pts]) => entry(p, slot, pts, pts + 2));
const total = (lineup: Lineup) => Math.round(lineup.filter(([, s]) => s !== SLOT.BN).reduce((a, [, , x]) => a + x, 0) * 100) / 100;

export const ESPN_ME_POINTS = total(MY_LINEUP); // 100.60
export const ESPN_OPP_POINTS = total(OPP_LINEUP); // 90.20
// ESPN supplies its own live team projections; the app shows them as given.
export const ESPN_ME_PROJECTED = 112;
export const ESPN_OPP_PROJECTED = 96.5;

// Finished weeks 1-5: [my points, opponent points, opponent team id]. Results: L W L W W.
export const ESPN_PAST: [number, number, number][] = [
  [118.2, 140.1, 2],
  [131.4, 120, 3],
  [102.6, 111.8, 4],
  [140, 99.5, 2],
  [125.3, 101, 3],
];

const members = [
  { id: ESPN_SWID, displayName: 'e2e_espn' },
  { id: '{OTHER-2}', displayName: 'rival_two' },
  { id: '{OTHER-3}', displayName: 'third_owner' },
  { id: '{OTHER-4}', displayName: 'fourth_owner' },
];

export function league(): EspnLeague {
  return {
    id: Number(ESPN_LEAGUE_ID),
    seasonId: Number(SEASON),
    scoringPeriodId: WEEK,
    status: { currentMatchupPeriod: WEEK },
    settings: {
      name: ESPN_LEAGUE_NAME,
      rosterSettings: {
        lineupSlotCounts: { '0': 1, '2': 2, '4': 2, '6': 1, '23': 1, '17': 1, '16': 1, '20': 5, '21': 1 },
      },
      acquisitionSettings: { acquisitionBudget: ESPN_FAAB.budget, isUsingAcquisitionBudget: true, waiverOrderReset: true },
    },
    members,
    teams: [
      { id: 1, name: ESPN_MY_TEAM, owners: [ESPN_SWID], waiverRank: ESPN_FAAB.waiverRank, transactionCounter: { acquisitionBudgetSpent: ESPN_FAAB.spent }, record: { overall: { wins: 3, losses: 2, ties: 0, pointsFor: 617.5, pointsAgainst: 573.2 } }, roster: { entries: entries(MY_LINEUP) } },
      { id: 2, name: ESPN_OPP_TEAM, owners: ['{OTHER-2}'], record: { overall: { wins: 2, losses: 3, ties: 0, pointsFor: 560, pointsAgainst: 590 } }, roster: { entries: entries(OPP_LINEUP) } },
      { id: 3, name: 'Third Place Finish', owners: ['{OTHER-3}'], record: { overall: { wins: 4, losses: 1, ties: 0, pointsFor: 650, pointsAgainst: 540 } }, roster: { entries: [] } },
      { id: 4, name: 'Basement Bandits', owners: ['{OTHER-4}'], record: { overall: { wins: 1, losses: 4, ties: 0, pointsFor: 480, pointsAgainst: 610 } }, roster: { entries: [] } },
    ],
    schedule: [
      ...ESPN_PAST.map(([mine, theirs, oppId], i) => {
        const home = i % 2 === 0; // alternate sides so the app has to find mine
        const me = { teamId: 1, totalPoints: mine };
        const opp = { teamId: oppId, totalPoints: theirs };
        return { id: i + 1, matchupPeriodId: i + 1, home: home ? me : opp, away: home ? opp : me };
      }),
      {
        id: 6,
        matchupPeriodId: WEEK,
        home: {
          teamId: 1,
          totalPoints: ESPN_ME_POINTS,
          totalPointsLive: ESPN_ME_POINTS,
          totalProjectedPointsLive: ESPN_ME_PROJECTED,
          rosterForCurrentScoringPeriod: { entries: entries(MY_LINEUP) },
        },
        away: {
          teamId: 2,
          totalPoints: ESPN_OPP_POINTS,
          totalPointsLive: ESPN_OPP_POINTS,
          totalProjectedPointsLive: ESPN_OPP_PROJECTED,
          rosterForCurrentScoringPeriod: { entries: entries(OPP_LINEUP) },
        },
      },
    ],
  };
}

// The kona_player_info view: players on no team in the league.
export function freeAgents() {
  return {
    players: FREE_AGENTS.map(([p, status]) => ({
      status,
      player: {
        id: p.espnId,
        fullName: p.name,
        defaultPositionId: POSITION_ID[p.position],
        proTeamId: TEAM_ID[p.team] ?? 0,
        injuryStatus: p.injury ? 'QUESTIONABLE' : 'ACTIVE',
        stats: espnWaiverStats(p),
      },
    })),
  };
}
