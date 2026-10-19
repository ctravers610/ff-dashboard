import type { LeagueSummary } from '@ffd/shared';
import { describe, expect, it, vi } from 'vitest';
import { missingWeeks } from './backfill.js';
import { recordSnapshots, snapshotRepo, toSnapshot } from './snapshots.js';

const league = (id: string, week = 6, overrides: Partial<LeagueSummary> = {}): LeagueSummary =>
  ({
    leagueId: id,
    platform: 'espn',
    name: `League ${id}`,
    season: '2026',
    week,
    myTeamId: '3',
    alerts: [],
    roster: [],
    standings: [
      { teamId: '3', teamName: 'Me', ownerName: 'me', avatarUrl: null, wins: 3, losses: 2, ties: 0, pointsFor: 600, pointsAgainst: 580, rank: 6 },
      { teamId: '4', teamName: 'Them', ownerName: 'them', avatarUrl: null, wins: 2, losses: 3, ties: 0, pointsFor: 500, pointsAgainst: 520, rank: 9 },
    ],
    matchup: {
      week,
      me: { teamId: '3', teamName: 'Me', points: 127.66, projected: 137.7, starters: [] },
      opponent: { teamId: '4', teamName: 'Them', points: 93.68, projected: 93.7, starters: [] },
    },
    ...overrides,
  }) as LeagueSummary;

describe('toSnapshot', () => {
  it('records points, projections, opponent and my standing', () => {
    expect(toSnapshot(league('A'))).toEqual({
      platform: 'espn',
      leagueId: 'A',
      leagueName: 'League A',
      season: '2026',
      week: 6,
      points: 127.66,
      projected: 137.7,
      opponentName: 'Them',
      opponentPoints: 93.68,
      opponentProjected: 93.7,
      allPlayRank: null,
      allPlayTeams: null,
      allPlayWinSlots: null,
      wins: 3,
      losses: 2,
      ties: 0,
      standingRank: 6,
      standingTeams: 2,
    });
  });

  it('returns null when there is no matchup to record', () => {
    expect(toSnapshot(league('B', 6, { matchup: null }))).toBeNull();
  });
});

describe('recordSnapshots', () => {
  const fakeStore = () => ({ save: vi.fn().mockResolvedValue(undefined) }) as unknown as typeof snapshotRepo;
  const start = Date.parse('2026-10-19T12:00:00Z');

  it('saves a league at most once every five minutes', async () => {
    const store = fakeStore();
    await recordSnapshots([league('T1')], store, start);
    await recordSnapshots([league('T1')], store, start + 60_000); // a minute later: skipped
    await recordSnapshots([league('T1')], store, start + 6 * 60_000); // six minutes later: saved again

    const saved = (store.save as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].length);
    expect(saved).toEqual([1, 0, 1]);
  });

  it('retries on the next load when a save fails', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
    const store = { save } as unknown as typeof snapshotRepo;

    await expect(recordSnapshots([league('T2')], store, start)).rejects.toThrow('db down');
    await recordSnapshots([league('T2')], store, start + 1000); // not throttled after a failure
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('missingWeeks', () => {
  it('lists earlier weeks that have no snapshot yet', () => {
    expect(missingWeeks(6, [6])).toEqual([1, 2, 3, 4, 5]);
    expect(missingWeeks(6, [2, 3, 6])).toEqual([1, 4, 5]);
    expect(missingWeeks(1, [])).toEqual([]);
  });
});
