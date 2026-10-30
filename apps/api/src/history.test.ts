import { describe, expect, it } from 'vitest';
import type { SnapshotRow } from './db/schema.js';
import { buildHistory, weekEndsAt, weekResult } from './history.js';

const row = (week: number, points: number, opponentPoints: number | null, extra: Partial<SnapshotRow> = {}): SnapshotRow => ({
  id: week,
  platform: 'sleeper',
  leagueId: 'L1',
  leagueName: 'League One',
  season: '2026',
  week,
  points,
  projected: null,
  opponentName: 'Rival',
  opponentPoints,
  opponentProjected: null,
  allPlayRank: null,
  allPlayTeams: null,
  allPlayWinSlots: null,
  wins: null,
  losses: null,
  ties: null,
  standingRank: null,
  standingTeams: null,
  capturedAt: new Date('2026-10-21T12:00:00Z'), // Wednesday after week 6
  ...extra,
});

describe('weekEndsAt', () => {
  it('is 9 AM Eastern the Tuesday after Monday night', () => {
    expect(weekEndsAt('2026', 1).toISOString()).toBe('2026-09-15T13:00:00.000Z'); // Labor Day is Sep 7
    expect(weekEndsAt('2026', 6).toISOString()).toBe('2026-10-20T13:00:00.000Z');
    expect(weekEndsAt('2026', 7).toISOString()).toBe('2026-10-27T13:00:00.000Z');
    expect(weekEndsAt('2026', 18).toISOString()).toBe('2027-01-12T14:00:00.000Z'); // into January, on standard time
    expect(weekEndsAt('2025', 1).toISOString()).toBe('2025-09-09T13:00:00.000Z'); // Labor Day on Sep 1
  });
});

describe('weekResult', () => {
  it('compares points against the opponent once the week is over', () => {
    expect(weekResult(row(1, 120, 100), 3)).toBe('win');
    expect(weekResult(row(1, 90, 100), 3)).toBe('loss');
    expect(weekResult(row(1, 100, 100), 3)).toBe('tie');
  });

  it('is live for the current week, whatever the score', () => {
    expect(weekResult(row(3, 200, 10), 3)).toBe('live');
  });

  it('has no result without an opponent', () => {
    expect(weekResult(row(1, 100, null), 3)).toBeNull();
  });

  it('has no result for a week captured before it ended', () => {
    const thursday = { capturedAt: new Date('2026-10-22T20:00:00Z') }; // before week 7's first game
    const sundayNight = { capturedAt: new Date('2026-10-19T02:30:00Z') }; // during week 6's Sunday night game
    expect(weekResult(row(7, 0, 0, thursday), 8)).toBeNull();
    expect(weekResult(row(6, 114.68, 100.2, sundayNight), 8)).toBeNull();
    expect(weekResult(row(6, 114.68, 100.2, { capturedAt: new Date('2026-10-20T13:00:00Z') }), 8)).toBe('win'); // Tuesday 9 AM
  });

  it('calls 0-0 nothing played, not a tie', () => {
    expect(weekResult(row(1, 0, 0), 3)).toBeNull();
    expect(weekResult(row(1, 0, null), 3)).toBeNull();
    expect(weekResult(row(1, 0, 12.5), 3)).toBe('loss');
  });

  it('decides an all-play week by finishing in the top half, ignoring the opponent', () => {
    const allPlay = { allPlayTeams: 12, allPlayWinSlots: 6 };
    expect(weekResult(row(6, 100, 150, { ...allPlay, allPlayRank: 6 }), 7)).toBe('win');
    expect(weekResult(row(6, 160, 150, { ...allPlay, allPlayRank: 7 }), 7)).toBe('loss');
  });
});

describe('buildHistory', () => {
  const rows = [
    row(3, 150, 100), // current week: live
    row(1, 120, 100),
    row(2, 90, 130),
    row(1, 80, 60, { platform: 'espn', leagueId: 'E1', leagueName: 'ESPN League' }),
  ];

  it('groups rows by league and orders weeks oldest first', () => {
    const history = buildHistory(rows, 3);
    expect(history.map((h) => [h.platform, h.name, h.weeks.map((w) => w.week)])).toEqual([
      ['sleeper', 'League One', [1, 2, 3]],
      ['espn', 'ESPN League', [1]],
    ]);
  });

  it('counts the record and average from finished weeks only', () => {
    const [sleeper] = buildHistory(rows, 3);
    expect(sleeper!.record).toEqual({ wins: 1, losses: 1, ties: 0 });
    expect(sleeper!.avgPoints).toBe(105); // (120 + 90) / 2, the live week excluded
    expect(sleeper!.weeks.map((w) => w.result)).toEqual(['win', 'loss', 'live']);
  });

  it('leaves ungraded weeks out of the record and average', () => {
    const history = buildHistory(
      [
        row(1, 120, 100),
        row(2, 0, 0), // nothing played
        row(7, 0, 0, { capturedAt: new Date('2026-10-22T20:00:00Z') }), // captured before kickoff
      ],
      8,
    );
    expect(history[0]!.weeks.map((w) => w.result)).toEqual(['win', null, null]);
    expect(history[0]!.record).toEqual({ wins: 1, losses: 0, ties: 0 });
    expect(history[0]!.avgPoints).toBe(120);
  });

  it('has no average before any week has finished', () => {
    expect(buildHistory([row(1, 100, 90)], 1)[0]!.avgPoints).toBeNull();
  });
});
