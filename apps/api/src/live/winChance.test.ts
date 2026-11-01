import type { DashboardResponse, LeagueSummary, Matchup } from '@ffd/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chanceRows, recordWinChances, resetWinChances, thin } from './winChance.js';

const side = (points: number, projected: number) => ({ teamId: 'x', teamName: 'x', points, projected, starters: [] });
const league = (leagueId: string, matchup: Matchup | null): LeagueSummary => ({
  leagueId,
  platform: 'sleeper',
  account: 'me',
  name: leagueId,
  season: '2026',
  week: 8,
  myTeamId: 'x',
  standings: [],
  matchup,
  alerts: [],
  roster: [],
});
const dashboard = (leagues: LeagueSummary[]): DashboardResponse => ({ season: '2026', week: 8, updatedAt: '', leagues, players: [], errors: [] });
const ahead: Matchup = { week: 8, me: side(100, 100), opponent: side(50, 50) };

describe('chanceRows', () => {
  it('has a point for each matchup of this week, and none without one to judge', () => {
    const at = new Date('2026-11-01T18:00:00Z');
    const rows = chanceRows(
      dashboard([league('a', ahead), league('none', null), league('bye', { week: 8, me: side(0, 0), opponent: null }), league('old', { ...ahead, week: 7 })]),
      at,
    );
    expect(rows).toEqual([{ leagueKey: 'sleeper:a', at, chance: 1 }]);
  });
});

describe('recordWinChances', () => {
  const store = { add: vi.fn(async () => {}), series: vi.fn(async () => new Map()) };
  const at = (seconds: number) => new Date(Date.UTC(2026, 10, 1, 18, 0, seconds));

  beforeEach(() => {
    resetWinChances();
    store.add.mockClear();
  });

  it('records at most one look a minute', async () => {
    const data = dashboard([league('a', ahead)]);
    await recordWinChances(data, store, at(0));
    await recordWinChances(data, store, at(30));
    expect(store.add).toHaveBeenCalledTimes(1);
    await recordWinChances(data, store, at(60));
    expect(store.add).toHaveBeenCalledTimes(2);
  });
});

describe('thin', () => {
  it('leaves a short series alone', () => {
    expect(thin([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('spaces a long one out, keeping both ends', () => {
    const points = Array.from({ length: 101 }, (_, i) => i);
    expect(thin(points, 5)).toEqual([0, 25, 50, 75, 100]);
  });
});
