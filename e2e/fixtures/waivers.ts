// Waiver fixtures: next week's schedule and projections, Sleeper's trending
// adds and ESPN's free agents. Claims made now play in week 7, since every
// week-6 game has kicked off.
//
// Projections are chosen so each league has one clear scenario:
// - Sleeper: DEN is on bye, so Jaylen Waddle (FLEX) is out; Najee Harris on the
//   bench covers 8, but free agent Rashee Rice projects 18. Adding Rice needs a
//   drop: Drake Maye (QB, 36 rest of season) is replaceable, since free agent
//   Geno Smith projects 144. Upgrades elsewhere find no safe drop, so Rice is
//   the only suggestion.
// - ESPN: two open roster spots, so upgrades need no drop: Rice over Malik
//   Nabers at WR (+8) and Chris Olave over Puka Nacua at FLEX (+4).

import type { EspnStat } from '../../apps/api/src/adapters/espn/types.js';
import { GAMES, PLAYERS as P, SEASON, UPCOMING_GAMES, WEEK, type FxPlayer } from './players.js';

export const CLAIM_WEEK = WEEK + 1;
export const LAST_WEEK = 18;
const REMAINING_WEEKS = LAST_WEEK - CLAIM_WEEK + 1; // 12

export const BYE_TEAM = 'DEN';

// Points each player projects for every remaining week; everyone else projects 10.
const WEEKLY: Partial<Record<keyof typeof P, number>> = {
  waddle: 0, // on bye in week 7
  rice: 18,
  reed: 16,
  olave: 14,
  geno: 12,
  doubs: 9,
  najee: 8,
  maye: 3,
};
const key = (p: FxPlayer) => (Object.keys(P) as (keyof typeof P)[]).find((k) => P[k] === p)!;
export const weekly = (p: FxPlayer) => WEEKLY[key(p)] ?? 10;
export const restOfSeason = (p: FxPlayer) => weekly(p) * REMAINING_WEEKS;

// Sleeper's projection rows for a later week: { rec: n } scores n points in the
// fixture league, which pays 1 per reception.
export const sleeperProjectionRows = (all: FxPlayer[]) => all.map((p) => ({ player_id: p.id, stats: { rec: weekly(p) } }));

export const trendingAdds = [
  { player_id: P.rice.id, count: 41_000 },
  { player_id: P.olave.id, count: 900 },
];

// Week 7's schedule: week 6's games again, none kicked off, except DEN is on
// bye (so SEA plays LAC instead).
export const claimWeekGames: [string, string][] = [
  ...GAMES.map(([home, , away]): [string, string] => [home, away === BYE_TEAM ? 'LAC' : away]),
  ...UPCOMING_GAMES,
];

// ESPN stat rows for waivers: the claim week's projection and rest of season
// (scoringPeriodId 0 is the season-level row), already in league scoring.
export const espnWaiverStats = (p: FxPlayer): EspnStat[] => [
  { seasonId: Number(SEASON), scoringPeriodId: CLAIM_WEEK, statSourceId: 1, statSplitTypeId: 1, appliedTotal: weekly(p) },
  { seasonId: Number(SEASON), scoringPeriodId: 0, statSourceId: 1, statSplitTypeId: 0, appliedTotal: restOfSeason(p) },
];

export const ESPN_FAAB = { budget: 100, spent: 37, waiverRank: 3 };
export const SLEEPER_FAAB = { budget: 100, used: 15, position: 2 };

// Not on any ESPN roster: Rice has just been dropped, so he's on waivers.
// (Geno Smith is left out: ESPN's QB is weak, and he'd add a third move.)
export const espnFreeAgents: [FxPlayer, 'WAIVERS' | 'FREEAGENT'][] = [
  [P.rice, 'WAIVERS'],
  [P.olave, 'FREEAGENT'],
  [P.hall, 'FREEAGENT'],
];
