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
import { FFPC_TEAM, ME as FFPC_STARTERS, MY_BENCH as FFPC_BENCH } from './ffpc.js';
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

// ── FFPC: its add/drop page, as copied from the browser ─────────────────
// FFPC's own projections on the page have Mike Evans down to 6, but the app
// prefers Sleeper's live projections (Evans 10), so free agent Jayden Reed (16,
// questionable but playing) is a +6 upgrade over Malik Nabers (10) at WR. FFPC
// rosters are always full, so it needs a drop: Drake Maye (36 rest of season) is
// replaceable by free agent Geno Smith (144). A second WR upgrade finds no safe drop.
export const FFPC_FAAB_LEFT = 640;
export const FFPC_BID_SCHEDULE = 'Wednesdays at 11 pm ET and Sundays at 10 am ET';
const ffpcProjection = (p: FxPlayer) => (p === P.evans ? 6 : p === P.allen ? 20 : weekly(p));
const ffpcAvailable: FxPlayer[] = [P.reed, P.olave, P.geno];

const ffpcCell = (p: FxPlayer) => {
  if (p.position === 'DEF') return `${p.team} DST`;
  const [first, ...last] = p.name.split(' ');
  const pos = p.position === 'K' ? 'PK' : p.position;
  return `${last.join(' ')}, ${first} ${p.team} (${pos})${p.injury ? ' Q' : ''}`;
};

export function ffpcWaiverPage(leagueNumber = '#12345'): string {
  const others = ['Alpha Dogs', 'Beta Squad', 'Gamma Rays', 'Delta Force', 'Echo Base'];
  const row = (...cells: (string | number)[]) => cells.join('\t');
  return [
    'someuser',
    'My Teams',
    `E2E Gorilla Tourney (Aug 5 9:00 PM) ${leagueNumber} - ${FFPC_TEAM} (2-3)`,
    'Transactions',
    'Free Agent Auction Bidding',
    `Remaining FAAB Dollars: $${FFPC_FAAB_LEFT}`,
    `Your league is currently in a Free Agent Auction Bidding period. Bids will be processed ${FFPC_BID_SCHEDULE}. To place a bid, click 'Add'.`,
    ...others.flatMap((team, i) => [`$${900 - i * 100}`, team]),
    'Bid Group Details',
    'Available Players',
    'Position: All QB RB WR TE PK DF WL',
    row('Player', 'Next Opp', 'Bye', 'Opp Rnk', 'Last', 'Proj', 'Avg', 'Pts', '% Own'),
    ...ffpcAvailable.flatMap((p) => [row('Add', ''), ffpcCell(p), row('OPP', 10, 5, 9, ffpcProjection(p), 8, 40, 30)]),
    'Team Roster',
    row('Player', 'BYE', 'PR', 'PROJ', 'PPG'),
    ...[...FFPC_STARTERS.map((s) => s.player), ...FFPC_BENCH.map(([, p]) => p)].flatMap((p) => [
      row('Drop', ''),
      ffpcCell(p),
      row(10, 20, ffpcProjection(p), 12),
    ]),
    '©2026 For Players, By Players LLC.',
  ].join('\n');
}

// ── When waivers run ────────────────────────────────────────────────────
// Sleeper's processed claims from weeks 1-5, each run at 3:05 AM Eastern on a
// Wednesday, so the app learns "Wed 3:00 AM". ESPN has no history in the
// fixtures, so its schedule is unknown and it sorts last.
const SLEEPER_RUNS = ['2026-09-16T07:05:00Z', '2026-09-23T07:05:00Z', '2026-09-30T07:05:00Z', '2026-10-07T07:05:00Z', '2026-10-14T07:05:00Z'];
// Each week's winning claim and what it cost: median $5, most $18 (Puka Nacua, week 2).
export const SLEEPER_WINNING_BIDS: [FxPlayer, number][] = [
  [P.doubs, 3],
  [P.puka, 18],
  [P.brooks, 5],
  [P.geno, 0],
  [P.olave, 9],
];
export function sleeperTransactions(week: number) {
  const at = SLEEPER_RUNS[week - 1];
  if (!at) return [];
  const [player, bid] = SLEEPER_WINNING_BIDS[week - 1]!;
  const trades = week === SLEEPER_TRADE.week ? [sleeperTrade(at)] : [];
  return [...trades, ...[0, 1].map((i) => ({
    type: 'waiver',
    status: i === 0 ? 'complete' : 'failed',
    status_updated: Date.parse(at) + i * 1000,
    leg: week,
    settings: { waiver_bid: i === 0 ? bid : 1 },
    adds: { [player.id]: i === 0 ? 3 : 4 },
  }))];
}

// One trade, in week 5: you (roster 1) get Najee Harris and $10 of FAAB; the
// rival (roster 2) gets Tee Higgins and a 2027 2nd. Najee scored 26 that week,
// on your bench.
export const SLEEPER_TRADE = { week: 5 };
function sleeperTrade(at: string) {
  return {
    type: 'trade',
    status: 'complete',
    status_updated: Date.parse(at) - 86_400_000,
    leg: SLEEPER_TRADE.week,
    roster_ids: [1, 2],
    adds: { [P.najee.id]: 1, [P.higgins.id]: 2 },
    drops: { [P.najee.id]: 2, [P.higgins.id]: 1 },
    draft_picks: [{ season: '2027', round: 2, roster_id: 1, previous_owner_id: 1, owner_id: 2 }],
    waiver_budget: [{ sender: 2, receiver: 1, amount: 10 }],
  };
}
