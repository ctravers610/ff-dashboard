import { describe, expect, it } from 'vitest';
import { buildStarters, findMyTeamId, teamName, toLeagueSummary } from './mapper.js';
import type { EspnLeague, EspnRosterEntry } from './types.js';

const entry = (
  id: number,
  lineupSlotId: number,
  fullName: string,
  extra: { pos?: number; team?: number; injury?: string; week6?: number } = {},
): EspnRosterEntry => ({
  playerId: id,
  lineupSlotId,
  playerPoolEntry: {
    player: {
      id,
      fullName,
      defaultPositionId: extra.pos ?? 2,
      proTeamId: extra.team ?? 2,
      injuryStatus: extra.injury ?? 'ACTIVE',
      stats: [
        { scoringPeriodId: 6, statSourceId: 1, appliedTotal: 99 }, // projection: ignored
        { scoringPeriodId: 6, statSourceId: 0, appliedTotal: extra.week6 ?? 0 },
      ],
    },
  },
});

const ME = '{AAAA-1111}';

const league = (): EspnLeague => ({
  id: 13396297,
  seasonId: 2026,
  scoringPeriodId: 6,
  status: { currentMatchupPeriod: 6 },
  settings: { name: 'ESPN Test', rosterSettings: { lineupSlotCounts: { '0': 1, '2': 2, '20': 5, '23': 1 } } },
  members: [
    { id: ME, displayName: 'colin' },
    { id: '{BBBB-2222}', displayName: 'rival' },
  ],
  teams: [
    {
      id: 1,
      name: 'My Squad',
      owners: [ME.toLowerCase()],
      record: { overall: { wins: 2, losses: 3, ties: 0, pointsFor: 600.456, pointsAgainst: 610 } },
      roster: {
        entries: [
          entry(10, 0, 'Josh Allen', { pos: 1, week6: 24.36 }),
          entry(11, 2, 'Hurt Back', { injury: 'OUT', week6: 0 }),
          entry(12, 20, 'Bench Guy', { injury: 'QUESTIONABLE' }),
        ],
      },
    },
    {
      id: 2,
      location: 'Big',
      nickname: 'Rivals',
      owners: ['{BBBB-2222}'],
      record: { overall: { wins: 4, losses: 1, ties: 0, pointsFor: 700, pointsAgainst: 550 } },
      roster: { entries: [entry(20, 0, 'Their QB', { pos: 1, week6: 18 })] },
    },
  ],
  schedule: [
    { id: 1, matchupPeriodId: 5, home: { teamId: 1, totalPoints: 90 }, away: { teamId: 2, totalPoints: 80 } },
    {
      id: 2,
      matchupPeriodId: 6,
      home: { teamId: 2, totalPoints: 0, totalPointsLive: 18 },
      away: { teamId: 1, totalPoints: 0, totalPointsLive: 24.36 },
    },
  ],
});

describe('ESPN mapper', () => {
  it('finds my team by SWID, ignoring case', () => {
    expect(findMyTeamId(league(), ME)).toBe(1);
    expect(findMyTeamId(league(), '{nobody}')).toBeNull();
  });

  it('builds team names from name or location + nickname', () => {
    const [mine, theirs] = league().teams!;
    expect(teamName(mine!)).toBe('My Squad');
    expect(teamName(theirs!)).toBe('Big Rivals');
  });

  it('fills starter slots in order, leaving unfilled slots empty and skipping the bench', () => {
    const starters = buildStarters(league().teams![0]!.roster!.entries, { '0': 1, '2': 2, '20': 5, '23': 1 }, 6);
    expect(starters.map((s) => [s.slot, s.player?.name ?? null, s.points])).toEqual([
      ['QB', 'Josh Allen', 24.36],
      ['RB', 'Hurt Back', 0],
      ['RB', null, 0],
      ['FLEX', null, 0],
    ]);
    expect(starters[0]!.player).toMatchObject({ position: 'QB', nflTeam: 'BUF', injuryStatus: null });
  });

  it('maps standings, the current matchup and lineup alerts', () => {
    const summary = toLeagueSummary({ league: league(), myTeamId: 1, account: 'colin' });
    expect(summary.standings.map((t) => [t.teamName, t.rank])).toEqual([
      ['Big Rivals', 1],
      ['My Squad', 2],
    ]);
    expect(summary.standings[1]!.pointsFor).toBe(600.46);
    expect(summary.matchup?.me).toMatchObject({ teamName: 'My Squad', points: 24.36 });
    expect(summary.matchup?.opponent).toMatchObject({ teamName: 'Big Rivals', points: 18 });
    expect(summary.alerts.map((a) => [a.slot, a.reason, a.detail])).toEqual([
      ['RB', 'injury', 'Out'],
      ['RB', 'empty', 'Empty RB slot'],
      ['FLEX', 'empty', 'Empty FLEX slot'],
    ]);
  });
});
