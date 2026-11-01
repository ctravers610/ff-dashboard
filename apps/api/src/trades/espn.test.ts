import type { Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { EspnLeague, EspnPlayer } from '../adapters/espn/types.js';
import type { LineupPlayer } from './analyze.js';
import { espnTradeReports, espnTradeWeek, parseEspnTrades, type EspnTrade, type EspnTradeInput } from './espn.js';

const trade = (at: string): EspnTrade => ({ at: new Date(at), teams: ['8', '4'], moves: [{ playerId: '1', toTeamId: '4' }, { playerId: '2', toTeamId: '8' }] });

const player = (id: number, position: string, stats: { week: number; points?: number; projected?: number }[] = []): EspnPlayer => ({
  id,
  fullName: `Player ${id}`,
  defaultPositionId: position === 'QB' ? 1 : 2,
  proTeamId: 29,
  stats: stats.flatMap((s) => [
    ...(s.points == null ? [] : [{ seasonId: 2026, scoringPeriodId: s.week, statSourceId: 0, statSplitTypeId: 1, appliedTotal: s.points }]),
    ...(s.projected == null ? [] : [{ seasonId: 2026, scoringPeriodId: s.week, statSourceId: 1, statSplitTypeId: 1, appliedTotal: s.projected }]),
  ]),
});

const line = (id: string, position: string, points: number, projected: number | null, started: boolean): LineupPlayer => ({ id, position, points, projected, started });
const named = (id: string, name: string, position: string): Player => ({ playerId: id, name, position, nflTeam: 'CAR', injuryStatus: null });

// Week 7 (trade on Oct 24): Four got the QB and started him over its other one; Eight
// got a back and sat him. Week 8 is still to come.
const input = (overrides: Partial<EspnTradeInput> = {}): EspnTradeInput => ({
  myTeamId: '4',
  slots: ['QB', 'RB'],
  season: '2026',
  finished: [7],
  left: [8],
  final: false,
  weeks: new Map([
    [7, {
      rosters: new Map([
        ['4', [line('1', 'QB', 30, 20, true), line('3', 'QB', 12, 15, false), line('5', 'RB', 10, 10, true)]],
        ['8', [line('6', 'QB', 18, 16, true), line('7', 'RB', 8, 9, true), line('2', 'RB', 22, 6, false)]],
      ]),
      traded: new Map([['1', { points: 30, projected: 20 }], ['2', { points: 22, projected: 6 }]]),
    }],
    [8, {
      rosters: new Map([
        ['4', [line('1', 'QB', 0, 20, true), line('3', 'QB', 0, 15, false), line('5', 'RB', 0, 10, true)]],
        ['8', [line('6', 'QB', 0, 16, true), line('7', 'RB', 0, 9, true), line('2', 'RB', 0, 6, false)]],
      ]),
      traded: new Map([['1', { points: 0, projected: 20 }], ['2', { points: 0, projected: 6 }]]),
    }],
  ]),
  schedule: [
    { id: 1, matchupPeriodId: 7, home: { teamId: 4, totalPoints: 40 }, away: { teamId: 9, totalPoints: 35 } },
    { id: 2, matchupPeriodId: 7, home: { teamId: 10, totalPoints: 20 }, away: { teamId: 8, totalPoints: 26 } },
  ],
  teamNames: new Map([['4', 'Four'], ['8', 'Eight'], ['9', 'Nine'], ['10', 'Ten']]),
  players: new Map([['1', named('1', 'Traded Quarterback', 'QB')], ['2', named('2', 'Traded Back', 'RB')]]),
  ...overrides,
});

describe('parseEspnTrades', () => {
  it('reads who moved where, from the shape ESPN sends', () => {
    const trades = parseEspnTrades({
      topics: [
        {
          date: Date.parse('2026-10-24T16:17:00Z'),
          messages: [
            { messageTypeId: 244, from: 8, to: 4, targetId: 3915511 },
            { messageTypeId: 244, from: 4, to: 8, targetId: 4432620 },
            { messageTypeId: 244, from: 4, to: 8, targetId: 4568490 },
          ],
        },
      ],
    });
    expect(trades).toEqual([
      {
        at: new Date('2026-10-24T16:17:00Z'),
        teams: ['8', '4'],
        moves: [
          { playerId: '3915511', toTeamId: '4' },
          { playerId: '4432620', toTeamId: '8' },
          { playerId: '4568490', toTeamId: '8' },
        ],
      },
    ]);
  });

  it('leaves out anything that is not a trade between two teams', () => {
    expect(parseEspnTrades({})).toEqual([]);
    expect(parseEspnTrades({ topics: [{ date: 1, messages: [{ messageTypeId: 179, from: 4, to: 0, targetId: 1 }] }] })).toEqual([]);
  });
});

describe('espnTradeWeek', () => {
  it('builds lineups from that week’s slots, points and projections', () => {
    const league = {
      teams: [
        { id: 4, roster: { entries: [
          { playerId: 1, lineupSlotId: 0, playerPoolEntry: { player: player(1, 'QB', [{ week: 7, points: 30, projected: 20 }]) } },
          { playerId: 3, lineupSlotId: 20, playerPoolEntry: { player: player(3, 'QB', [{ week: 7, points: 12, projected: 15 }]) } },
          { playerId: 5, lineupSlotId: 21, playerPoolEntry: { player: player(5, 'RB', [{ week: 7, projected: 0 }]) } },
        ] } },
        { id: 9, roster: { entries: [{ playerId: 9, lineupSlotId: 0, playerPoolEntry: { player: player(9, 'QB') } }] } },
      ],
    } as EspnLeague;
    const week = espnTradeWeek(league, new Set(['4']), [player(2, 'RB', [{ week: 7, points: 22, projected: 6 }])], 2026, 7);
    expect(week.rosters.get('4')).toEqual([
      line('1', 'QB', 30, 20, true),
      line('3', 'QB', 12, 15, false), // on the bench
      line('5', 'RB', 0, 0, false), // on IR
    ]);
    expect(week.rosters.has('9')).toBe(false); // didn't trade
    expect(week.traded.get('2')).toEqual({ points: 22, projected: 6 });
  });
});

describe('espnTradeReports', () => {
  it('takes the week from the date and scores both sides from then on', () => {
    const [report] = espnTradeReports([trade('2026-10-24T16:17:00Z')], input());
    expect(report).toMatchObject({ id: '7:0', week: 7, final: false });

    const four = report!.sides.find((s) => s.teamName === 'Four')!;
    expect(four.isMe).toBe(true);
    // The new QB's 30 against the 12 of the QB who'd have started without him; the back it gave up, projected below its own, wouldn't have started.
    expect(four.gain).toBe(18);
    expect(four.received).toEqual([{ name: 'Traded Quarterback', position: 'QB', points: 30, started: 30, startedWeeks: 1, rosterWeeks: 1, restOfSeason: 20 }]);

    const eight = report!.sides.find((s) => s.teamName === 'Eight')!;
    expect(eight.isMe).toBe(false);
    // Without the trade it has the QB back, projected over its own: 30 instead of 18.
    expect(eight.gain).toBe(-12);
    expect(eight.received[0]).toMatchObject({ name: 'Traded Back', points: 22, started: 0, startedWeeks: 0, rosterWeeks: 1, restOfSeason: 6 });
  });

  it('flips the games the trade decided, using ESPN’s scores and opponents', () => {
    const [report] = espnTradeReports([trade('2026-10-24T16:17:00Z')], input());
    // Four's 40 would have been 22 against Nine's 35, on either side of the schedule entry.
    expect(report!.sides.find((s) => s.teamName === 'Four')!.flips).toEqual([{ week: 7, opponent: 'Nine', won: true }]);
    // Eight's 26 would have been 38, and it beat Ten's 20 either way.
    expect(report!.sides.find((s) => s.teamName === 'Eight')!.flips).toEqual([]);
  });

  it('projects the weeks ahead from each week’s projections', () => {
    const [report] = espnTradeReports([trade('2026-10-24T16:17:00Z')], input());
    // Week 8: QB 20 and RB 10 with the trade; without it, the other QB's 15 and the same RB (the old back projects 6).
    expect(report!.sides.find((s) => s.teamName === 'Four')!.projectedGain).toBe(5);
  });

  it('skips the weeks before the trade, and doesn’t project once the season is over', () => {
    const [report] = espnTradeReports([trade('2026-11-04T16:17:00Z')], input({ final: true, left: [] }));
    expect(report!.week).toBe(9);
    const four = report!.sides.find((s) => s.teamName === 'Four')!;
    expect(four.gain).toBe(0);
    expect(four.projectedGain).toBe(0);
    expect(report!.final).toBe(true);
  });

  it('leaves out a player ESPN can’t name, and puts the newest trade first', () => {
    const reports = espnTradeReports([trade('2026-10-24T16:17:00Z'), trade('2026-11-04T16:17:00Z')], input({ players: new Map([['1', named('1', 'Traded Quarterback', 'QB')]]) }));
    expect(reports.map((r) => r.week)).toEqual([9, 7]);
    expect(reports[1]!.sides.flatMap((s) => s.received.map((p) => p.name))).toEqual(['Traded Quarterback']);
  });

  it('names a team ESPN doesn’t list by its id', () => {
    const [report] = espnTradeReports([trade('2026-10-24T16:17:00Z')], input({ teamNames: new Map() }));
    expect(report!.sides.map((s) => s.teamName).sort()).toEqual(['Team 4', 'Team 8']);
  });
});
