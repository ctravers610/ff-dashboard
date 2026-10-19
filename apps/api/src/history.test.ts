import { describe, expect, it } from 'vitest';
import type { SnapshotRow } from './db/schema.js';
import { buildHistory, weekResult } from './history.js';

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
  capturedAt: new Date('2026-10-19T12:00:00Z'),
  ...extra,
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

  it('has no average before any week has finished', () => {
    expect(buildHistory([row(1, 100, 90)], 1)[0]!.avgPoints).toBeNull();
  });
});
