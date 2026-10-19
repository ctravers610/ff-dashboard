// An FFPC Live Scoring page as copied from the browser (Ctrl+A, Ctrl+C), with
// made-up league and team names, plus the real-time stats it should be scored
// against. FFPC has no API, so the page is the only input the app ever sees.
//
// Every expected score below is worked out by hand from FFPC's published rules
// (0.05/pass yd, 4/pass TD, 0.1/rush or rec yd, 6/other TD, 1/rec, 1.5/rec for
// TEs, K: 3/FG + 0.1/yd over 30 + 1/PAT, DEF: 1/sack, 2/takeaway + points-allowed
// tier), not computed by the app's own scoring code, so the tests check it
// independently.

import { PLAYERS as P, type FxPlayer } from './players.js';

export const FFPC_LEAGUE = 'E2E Gorilla Tourney #12345';
export const FFPC_TEAM = 'Test Club';
export const FFPC_OPP = 'Rival Squad';

interface Starter {
  slot: 'QB' | 'RB' | 'WR' | 'TE' | 'Flex' | 'PK' | 'DST';
  player: FxPlayer;
  stats: Record<string, number>;
  expected: number;
}

export const ME: Starter[] = [
  { slot: 'QB', player: P.allen, stats: { pass_yd: 250, pass_td: 2, rush_yd: 20 }, expected: 22.5 }, // 12.5 + 8 + 2
  { slot: 'RB', player: P.bijan, stats: { rush_yd: 100, rush_td: 1, rec: 4, rec_yd: 30 }, expected: 23 }, // 10 + 6 + 4 + 3
  { slot: 'RB', player: P.najee, stats: { rush_yd: 50, rec: 2, rec_yd: 10 }, expected: 8 }, // 5 + 2 + 1
  { slot: 'WR', player: P.nabers, stats: { rec: 8, rec_yd: 120 }, expected: 20 }, // 8 + 12
  { slot: 'WR', player: P.evans, stats: { rec: 3, rec_yd: 40, rec_td: 1 }, expected: 13 }, // 3 + 4 + 6
  { slot: 'TE', player: P.bowers, stats: { rec: 6, rec_yd: 70 }, expected: 16 }, // 9 (TE premium) + 7
  { slot: 'Flex', player: P.puka, stats: { rec: 5, rec_yd: 80 }, expected: 13 }, // 5 + 8
  { slot: 'Flex', player: P.cook, stats: { rush_yd: 60, rush_td: 1, rec: 1, rec_yd: 5 }, expected: 13.5 }, // 6 + 6 + 1 + 0.5
  { slot: 'PK', player: P.little, stats: { fgm: 2, fgm_yds_over_30: 17, xpm: 2 }, expected: 9.7 }, // 6 + 1.7 + 2
  { slot: 'DST', player: P.bufDef, stats: { sack: 3, int: 1 }, expected: 8 }, // 3 + 2 + tier(17 allowed) 3
];
export const OPP: Starter[] = [
  { slot: 'QB', player: P.mahomes, stats: { pass_yd: 300, pass_td: 3 }, expected: 27 }, // 15 + 12
  { slot: 'RB', player: P.henry, stats: { rush_yd: 80, rush_td: 1 }, expected: 14 }, // 8 + 6
  { slot: 'RB', player: P.saquon, stats: { rush_yd: 40, rec: 3, rec_yd: 20 }, expected: 9 }, // 4 + 3 + 2
  { slot: 'WR', player: P.higgins, stats: { rec: 6, rec_yd: 75 }, expected: 13.5 }, // 6 + 7.5
  { slot: 'WR', player: P.waddle, stats: { rec: 4, rec_yd: 50 }, expected: 9 }, // 4 + 5
  { slot: 'TE', player: P.kelce, stats: { rec: 5, rec_yd: 40 }, expected: 11.5 }, // 7.5 + 4
  { slot: 'Flex', player: P.hall, stats: { rush_yd: 30, rec: 2, rec_yd: 15 }, expected: 6.5 }, // 3 + 2 + 1.5
  { slot: 'Flex', player: P.olave, stats: { rec: 3, rec_yd: 30 }, expected: 6 }, // 3 + 3
  { slot: 'PK', player: P.pineiro, stats: { fgm: 1, fgm_yds_over_30: 5, xpm: 1 }, expected: 4.5 }, // 3 + 0.5 + 1
  { slot: 'DST', player: P.seaDef, stats: { sack: 2 }, expected: 5 }, // 2 + tier(17 allowed) 3
];

const total = (xs: Starter[]) => Math.round(xs.reduce((a, s) => a + s.expected, 0) * 100) / 100;
export const FFPC_ME_POINTS = total(ME); // 146.70
export const FFPC_OPP_POINTS = total(OPP); // 106.00

export const MY_BENCH: [string, FxPlayer][] = [['QB', P.maye], ['RB', P.brooks]];
const OPP_BENCH: [string, FxPlayer][] = [['WR', P.rice]];

// All-play week scoreboard, as shown at the top of the page: [name as truncated by FFPC, points, projected].
// Only my team and my opponent are re-scored live; the rest keep the pasted numbers.
export const SCOREBOARD: [string, number, number][] = [
  ['Alpha Dogs', 160, 165],
  ['Bravo Brigad', 150, 155],
  [FFPC_TEAM, 140, 150],
  [FFPC_OPP, 120, 125],
  ['Charlie Crew', 90, 95],
  ['Delta Force', 80, 85],
];

// Pasted before kickoff: every starter shows 0.00, so any non-zero score on the
// card has to come from the live stats feed, not from the page.
const scoreHeader = (team: string) => [
  team,
  'In Play:\t0',
  'Yet To Play:\t10',
  'Player Min Remaining:\t600',
  'Projected Points:\t150.00',
  '0.00',
];

const abbr = (p: FxPlayer) => p.team;

export function livePage(): string {
  const pageLines: string[] = [
    'someuser',
    '',
    'My Teams',
    '',
    `E2E Gorilla Tourney (Aug 5 9:00 PM) #12345 - ${FFPC_TEAM} (2-3)`,
    'My Teams',
    'League',
    'Live Scoring',
    'Standings',
    'Scoreboard - All Play Week ',
    '',
    'Week 6 (Current)',
    ...SCOREBOARD.flatMap(([name, pts, proj]) => [name, String(pts), `PMR: 60\tProj: ${proj}`]),
    '',
  ];

  const side = (team: string, lineup: Starter[], bench: [string, FxPlayer][]) => [
    ...scoreHeader(team),
    ...lineup.flatMap((s) => [
      `${s.slot}\t\t`,
      s.player.position === 'DEF' ? `${s.player.team} Team Defense ${s.player.team}` : `${s.player.name} ${abbr(s.player)}`,
      s.player.position === 'K' ? 'Projected Points: 8.00' : '0 ReYds',
      '0.00',
      `${abbr(s.player)}OPP`,
      'vs OPP | 1:00 Sun',
    ]),
    'Pos\tBench\tStatus\tStats\tTotal',
    ...bench.flatMap(([pos, p]) => [`${pos}\t${p.name}, ${p.team}\tOPP`, '1:00 Sun\t\t0.00']),
  ];

  return [...pageLines, ...side(FFPC_TEAM, ME, MY_BENCH), ...side(FFPC_OPP, OPP, OPP_BENCH), 'Live Chat', 'Online Owners'].join('\n');
}

// Real-time stats rows as the stats feed would serve them for the week.
export function statsRows(): { player_id: string; stats: Record<string, number> }[] {
  return [...ME, ...OPP].map((s) => ({ player_id: s.player.id, stats: s.stats }));
}
