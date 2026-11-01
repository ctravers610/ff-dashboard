import type { Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { YahooRosterSpot, YahooTrade } from '../adapters/yahoo/parse.js';
import { yahooTradeReports, type YahooTradeInput, type YahooTradeWeek } from './yahoo.js';

const player = (id: string, name: string, position: string): Player => ({ playerId: `yahoo:${id}`, name, position, nflTeam: 'CAR', injuryStatus: null });
const spot = (p: Player, slot: string): YahooRosterSpot => ({ player: p, slot, points: 0 });

const qb = player('1', 'Traded Quarterback', 'QB');
const rb = player('2', 'Traded Back', 'RB');

const trade = (at: string): YahooTrade => ({
  at: new Date(at),
  teams: [{ key: 't.1', name: 'One' }, { key: 't.2', name: 'Two' }],
  moves: [{ player: qb, toTeamKey: 't.2' }, { player: rb, toTeamKey: 't.1' }],
});

const week = (rosters: [string, YahooRosterSpot[]][], points: [Player, number][]): YahooTradeWeek => ({
  rosters: new Map(rosters),
  points: new Map(points.map(([p, n]) => [p.playerId, n])),
  replacement: new Map([['QB', 15], ['RB', 8]]),
});

const input = (overrides: Partial<YahooTradeInput> = {}): YahooTradeInput => ({
  myTeamKey: 't.1',
  weekOf: (at) => (at.getTime() < Date.parse('2026-10-20') ? 6 : 7),
  weeks: new Map([
    [6, week([['t.1', [spot(rb, 'RB')]], ['t.2', [spot(qb, 'QB')]]], [[qb, 25], [rb, 18]])], // QB +10, RB +10
    [7, week([['t.1', [spot(rb, 'BN')]], ['t.2', []]], [[qb, 40], [rb, 30]])], // both off the lineup: count for nothing
  ]),
  restOfSeason: () => null,
  final: false,
  ...overrides,
});

describe('yahooTradeReports', () => {
  it('scores what each team actually started, from the trade week on', () => {
    const [report] = yahooTradeReports([trade('2026-10-18T17:00:00Z')], input());
    expect(report).toMatchObject({ id: '6:0', week: 6, margin: 0, final: false });

    const one = report!.sides.find((s) => s.teamName === 'One')!;
    expect(one.isMe).toBe(true);
    // On the roster both weeks, started only in week 6.
    expect(one.received).toEqual([{ name: 'Traded Back', position: 'RB', points: 48, started: 18, startedWeeks: 1, rosterWeeks: 2, overReplacement: 10, restOfSeason: null }]);

    const two = report!.sides.find((s) => s.teamName === 'Two')!;
    expect(two.isMe).toBe(false);
    // Gone by week 7, so that week's 40 points aren't theirs.
    expect(two.received).toEqual([{ name: 'Traded Quarterback', position: 'QB', points: 25, started: 25, startedWeeks: 1, rosterWeeks: 1, overReplacement: 10, restOfSeason: null }]);
  });

  it('skips the weeks before the trade', () => {
    const [report] = yahooTradeReports([trade('2026-10-21T17:00:00Z')], input());
    expect(report!.week).toBe(7);
    expect(report!.sides.find((s) => s.teamName === 'One')!.received[0]).toMatchObject({ points: 30, rosterWeeks: 1, startedWeeks: 0 });
  });

  it('counts a player on the bench or on IR as rostered but not started', () => {
    const weeks = new Map([[6, week([['t.1', [spot(rb, 'IR')]], ['t.2', [spot(qb, 'BN')]]], [[qb, 25], [rb, 18]])]]);
    const [report] = yahooTradeReports([trade('2026-10-18T17:00:00Z')], input({ weeks }));
    expect(report!.sides.map((s) => s.overReplacement)).toEqual([0, 0]);
    expect(report!.sides.flatMap((s) => s.received).map((p) => [p.rosterWeeks, p.startedWeeks])).toEqual([[1, 0], [1, 0]]);
  });

  it('puts the newest trade first and reports projections and the final verdict', () => {
    const reports = yahooTradeReports([trade('2026-10-18T17:00:00Z'), trade('2026-10-21T17:00:00Z')], input({ restOfSeason: (p) => (p === rb ? 50 : null), final: true }));
    expect(reports.map((r) => r.week)).toEqual([7, 6]);
    expect(reports[0]!.final).toBe(true);
    expect(reports[0]!.sides.find((s) => s.teamName === 'One')!.restOfSeason).toBe(50);
  });
});
