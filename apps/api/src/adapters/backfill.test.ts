import type { LeagueSummary } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { pastWeekSnapshots } from './espn/history.js';
import type { EspnLeague } from './espn/types.js';
import { pastWeekSnapshot } from './sleeper/history.js';

const standings = [
  { teamId: '4', teamName: 'My Team' },
  { teamId: '7', teamName: 'Rival' },
] as LeagueSummary['standings'];

describe('Sleeper past weeks', () => {
  const league = { leagueId: 'S1', name: 'Sleeper League', season: '2026', myTeamId: '4', standings } as LeagueSummary;
  const matchups = [
    { roster_id: 4, matchup_id: 2, points: 131.349, starters: [], starters_points: [] },
    { roster_id: 7, matchup_id: 2, points: 120.1, starters: [], starters_points: [] },
    { roster_id: 9, matchup_id: 3, points: 88, starters: [], starters_points: [] },
  ];

  it("builds my week from the matchup I'm in, naming the opponent", () => {
    expect(pastWeekSnapshot(league, 3, matchups)).toEqual({
      platform: 'sleeper',
      leagueId: 'S1',
      leagueName: 'Sleeper League',
      season: '2026',
      week: 3,
      points: 131.35,
      opponentName: 'Rival',
      opponentPoints: 120.1,
    });
  });

  it('skips a week where I had no matchup (bye)', () => {
    expect(pastWeekSnapshot(league, 3, [{ roster_id: 4, matchup_id: null, points: 0, starters: [], starters_points: [] }])).toBeNull();
    expect(pastWeekSnapshot(league, 3, [])).toBeNull();
  });
});

describe('ESPN past weeks', () => {
  const summary = { leagueId: 'E1', name: 'ESPN League', season: '2026', myTeamId: '4', standings } as LeagueSummary;
  const espn = {
    schedule: [
      { id: 1, matchupPeriodId: 1, home: { teamId: 4, totalPoints: 126.18 }, away: { teamId: 7, totalPoints: 180.56 } },
      { id: 2, matchupPeriodId: 2, home: { teamId: 7, totalPoints: 115.68 }, away: { teamId: 4, totalPoints: 116.9 } },
      { id: 3, matchupPeriodId: 3, home: { teamId: 4 }, away: { teamId: 7 } }, // not scored yet
      { id: 4, matchupPeriodId: 1, home: { teamId: 8, totalPoints: 100 }, away: { teamId: 9, totalPoints: 90 } }, // not mine
    ],
  } as unknown as EspnLeague;

  it('finds my side whether I was home or away', () => {
    const rows = pastWeekSnapshots(espn, summary, [1, 2]);
    expect(rows.map((r) => [r.week, r.points, r.opponentName, r.opponentPoints])).toEqual([
      [1, 126.18, 'Rival', 180.56],
      [2, 116.9, 'Rival', 115.68],
    ]);
  });

  it('skips weeks that have no score yet or no game for me', () => {
    expect(pastWeekSnapshots(espn, summary, [3, 4])).toEqual([]);
  });
});
