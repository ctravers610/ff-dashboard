import type { Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { YahooMatchup, YahooRosterSpot, YahooTrade } from '../adapters/yahoo/parse.js';
import { yahooTradeReports, type YahooTradeInput } from './yahoo.js';

const player = (id: string, name: string, position: string): Player => ({ playerId: `yahoo:${id}`, name, position, nflTeam: 'CAR', injuryStatus: null });
const spot = (p: Player, slot: string, points = 0): YahooRosterSpot => ({ player: p, slot, points });

const qb = player('1', 'Traded Quarterback', 'QB');
const rb = player('2', 'Traded Back', 'RB');
const otherQb = player('3', 'Their Other Quarterback', 'QB');
const otherRb = player('4', 'Their Other Back', 'RB');

const trade = (at: string): YahooTrade => ({
  at: new Date(at),
  teams: [{ key: 't.1', name: 'One' }, { key: 't.2', name: 'Two' }],
  moves: [{ player: qb, toTeamKey: 't.2' }, { player: rb, toTeamKey: 't.1' }],
});

const game = (week: number, me: string, myName: string, points: number, them: string, theirName: string, theirPoints: number): YahooMatchup => ({
  week,
  status: 'postevent',
  me: { teamKey: me, teamName: myName, points, projected: null },
  opponent: { teamKey: them, teamName: theirName, points: theirPoints, projected: null },
});

// One gave up its QB for a back, and started its other QB and the new back. Two sat the new QB.
const input = (overrides: Partial<YahooTradeInput> = {}): YahooTradeInput => ({
  myTeamKey: 't.1',
  slots: ['QB', 'RB'],
  weekOf: (at) => (at.getTime() < Date.parse('2026-10-20') ? 6 : 7),
  weeks: new Map([
    [6, { rosters: new Map([['t.1', [spot(otherQb, 'QB', 20), spot(rb, 'RB', 18)]], ['t.2', [spot(otherRb, 'RB', 10), spot(qb, 'BN', 25)]]]), points: new Map([[qb.playerId, 25], [rb.playerId, 18]]) }],
    [7, { rosters: new Map([['t.1', [spot(otherQb, 'QB', 15), spot(rb, 'BN', 30)]], ['t.2', [spot(qb, 'QB', 40)]]]), points: new Map([[qb.playerId, 40], [rb.playerId, 30]]) }],
  ]),
  left: [8],
  final: false,
  schedule: new Map([
    ['t.1', [game(6, 't.1', 'One', 100, 't.9', 'Nine', 95), game(7, 't.1', 'One', 90, 't.9', 'Nine', 95)]],
    ['t.2', [game(6, 't.2', 'Two', 80, 't.8', 'Eight', 85), game(7, 't.2', 'Two', 110, 't.8', 'Eight', 85)]],
  ]),
  rostersNow: new Map([['t.1', [spot(otherQb, 'QB'), spot(rb, 'RB')]], ['t.2', [spot(qb, 'QB'), spot(otherRb, 'RB')]]]),
  projected: (_, p) => ({ [qb.playerId]: 14, [rb.playerId]: 12, [otherQb.playerId]: 16, [otherRb.playerId]: 11 })[p.playerId] ?? null,
  ...overrides,
});

describe('yahooTradeReports', () => {
  it('scores each team against the lineup it would have had, from the trade week on', () => {
    const [report] = yahooTradeReports([trade('2026-10-18T17:00:00Z')], input());
    expect(report).toMatchObject({ id: '6:0', week: 6, final: false });

    const one = report!.sides.find((s) => s.teamName === 'One')!;
    expect(one.isMe).toBe(true);
    // Week 6: the new back's 18 filled a slot nobody else could, and the old QB, projected below their other one, wouldn't have started. Week 7: the back sat, so nothing changed.
    expect(one.gain).toBe(18);
    expect(one.received).toEqual([{ name: 'Traded Back', position: 'RB', points: 48, started: 18, startedWeeks: 1, rosterWeeks: 2, restOfSeason: 12 }]);

    const two = report!.sides.find((s) => s.teamName === 'Two')!;
    expect(two.isMe).toBe(false);
    expect(two.received).toEqual([{ name: 'Traded Quarterback', position: 'QB', points: 65, started: 40, startedWeeks: 1, rosterWeeks: 2, restOfSeason: 14 }]);
    // Week 6: the old back, projected over their other one, would have scored 18 for his 10: -8. Week 7: the new QB's 40 against the old back's 30: +10.
    expect(two.gain).toBe(2);
  });

  it('flips the games the trade decided', () => {
    const [report] = yahooTradeReports([trade('2026-10-18T17:00:00Z')], input());
    const one = report!.sides.find((s) => s.teamName === 'One')!;
    expect(one.flips).toEqual([{ week: 6, opponent: 'Nine', won: true }]); // 82 without the back, against 95
    const two = report!.sides.find((s) => s.teamName === 'Two')!;
    expect(two.flips).toEqual([{ week: 6, opponent: 'Eight', won: false }]); // 88 without the trade, against 85; week 7 was won either way
  });

  it('skips the weeks before the trade', () => {
    const [report] = yahooTradeReports([trade('2026-10-21T17:00:00Z')], input());
    expect(report!.week).toBe(7);
    expect(report!.sides.find((s) => s.teamName === 'One')!.received[0]).toMatchObject({ points: 30, rosterWeeks: 1, startedWeeks: 0 });
  });

  it('counts a player on the bench or on IR as rostered but not started', () => {
    const weeks = new Map([[6, { rosters: new Map([['t.1', [spot(otherQb, 'QB', 20), spot(rb, 'IR', 18)]], ['t.2', [spot(otherRb, 'RB', 10), spot(qb, 'BN', 25)]]]), points: new Map([[qb.playerId, 25], [rb.playerId, 18]]) }]]);
    const [report] = yahooTradeReports([trade('2026-10-18T17:00:00Z')], input({ weeks }));
    expect(report!.sides.flatMap((s) => s.received).map((p) => [p.rosterWeeks, p.startedWeeks])).toEqual([[1, 0], [1, 0]]);
  });

  it('puts the newest trade first', () => {
    const reports = yahooTradeReports([trade('2026-10-18T17:00:00Z'), trade('2026-10-21T17:00:00Z')], input({ final: true }));
    expect(reports.map((r) => r.week)).toEqual([7, 6]);
    expect(reports[0]!.final).toBe(true);
  });
});
