import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SleeperPlayerMap } from '../adapters/sleeper/types.js';
import type { GameScore } from '../scoring/games.js';
import { recordTrendingAdds, toTrendingRows, trendingDay, trendingRepo } from './trending.js';

const players: SleeperPlayerMap = {
  '1': { name: 'Sam Sample', position: 'RB', team: 'BUF', injury_status: null },
  '2': { name: 'Tom Test', position: 'WR', team: 'KC', injury_status: null },
  '3': { name: 'Sam Sample', position: 'RB', team: 'NYG', injury_status: null }, // another with the same name
  PHI: { name: 'Philadelphia Eagles', position: 'DEF', team: 'PHI', injury_status: null },
  '4': { name: 'Nobody Known', position: '', team: null, injury_status: null },
};

const client = vi.hoisted(() => ({
  state: vi.fn(),
  trending: vi.fn(),
  players: vi.fn(),
}));
const nflGames = vi.hoisted(() => vi.fn());
vi.mock('../adapters/sleeper/client.js', () => ({ sleeperClient: client }));
vi.mock('../scoring/games.js', () => ({ nflGames }));

describe('trendingDay', () => {
  it('starts each day at 9 PM Eastern', () => {
    expect(trendingDay(new Date('2026-10-28T00:59:00Z'))).toBe('2026-10-26'); // Tue 8:59 PM EDT
    expect(trendingDay(new Date('2026-10-28T01:00:00Z'))).toBe('2026-10-27'); // Tue 9:00 PM EDT
    expect(trendingDay(new Date('2026-10-28T07:00:00Z'))).toBe('2026-10-27'); // Wed 3:00 AM EDT
  });

  it('crosses month boundaries and clock changes', () => {
    expect(trendingDay(new Date('2026-11-01T12:00:00Z'))).toBe('2026-10-31'); // Sun morning, the clocks just went back
    expect(trendingDay(new Date('2026-11-02T01:59:00Z'))).toBe('2026-10-31'); // Sun 8:59 PM EST
    expect(trendingDay(new Date('2026-11-02T02:00:00Z'))).toBe('2026-11-01'); // Sun 9:00 PM EST
  });
});

describe('toTrendingRows', () => {
  const at = { day: '2026-10-27', season: '2026', week: 9 };

  it('records each player by the key the waiver page uses', () => {
    expect(toTrendingRows([{ player_id: '1', count: 5000 }, { player_id: 'PHI', count: 800 }], players, at)).toEqual([
      { ...at, playerKey: 'RB:samsample', position: 'RB', adds: 5000 },
      { ...at, playerKey: 'DEF:PHI', position: 'DEF', adds: 800 },
    ]);
  });

  it('leaves out players with no position or missing from the player list', () => {
    expect(toTrendingRows([{ player_id: '4', count: 300 }, { player_id: '999', count: 200 }], players, at)).toEqual([]);
  });

  it('keeps the larger count when two players share a key', () => {
    const rows = toTrendingRows([{ player_id: '3', count: 100 }, { player_id: '1', count: 400 }, { player_id: '3', count: 50 }], players, at);
    expect(rows.map((r) => [r.playerKey, r.adds])).toEqual([['RB:samsample', 400]]);
  });
});

describe('recordTrendingAdds', () => {
  // Tuesday 9:30 PM Eastern.
  const now = new Date('2026-10-28T01:30:00Z');
  const fakeStore = (hasDay = false) => {
    const store = { hasDay: vi.fn().mockResolvedValue(hasDay), save: vi.fn().mockResolvedValue(undefined) };
    return { store, repo: store as unknown as typeof trendingRepo };
  };
  const gamesStarted = (started: boolean) => new Map([['g', { started } as GameScore]]);

  beforeEach(() => {
    vi.clearAllMocks();
    client.state.mockResolvedValue({ season: '2026', week: 8, season_type: 'regular' });
    client.trending.mockResolvedValue([{ player_id: '2', count: 1200 }]);
    client.players.mockResolvedValue(players);
    nflGames.mockResolvedValue(gamesStarted(true));
  });

  it("saves the day's snapshot for the week a claim would play in", async () => {
    const { store, repo } = fakeStore();
    await expect(recordTrendingAdds(repo, now, false)).resolves.toBe(1);
    expect(store.hasDay).toHaveBeenCalledWith('2026-10-27');
    expect(store.save).toHaveBeenCalledWith([{ day: '2026-10-27', season: '2026', week: 9, playerKey: 'WR:tomtest', position: 'WR', adds: 1200 }]);
  });

  it("uses this week until its first game kicks off, and stops at the regular season's last week", async () => {
    const { store, repo } = fakeStore();
    nflGames.mockResolvedValue(gamesStarted(false));
    await recordTrendingAdds(repo, now, false);
    expect(store.save.mock.calls[0]![0][0].week).toBe(8);

    client.state.mockResolvedValue({ season: '2026', week: 18, season_type: 'regular' });
    nflGames.mockResolvedValue(gamesStarted(true));
    await recordTrendingAdds(repo, now, false);
    expect(store.save.mock.calls[1]![0][0].week).toBe(18);
  });

  it('still saves when the games can not be loaded', async () => {
    const { store, repo } = fakeStore();
    nflGames.mockRejectedValue(new Error('scoreboard down'));
    await expect(recordTrendingAdds(repo, now, false)).resolves.toBe(1);
    expect(store.save.mock.calls[0]![0][0].week).toBe(9);
  });

  it('does nothing when the day is already saved, not even ask Sleeper', async () => {
    const { store, repo } = fakeStore(true);
    await expect(recordTrendingAdds(repo, now, false)).resolves.toBe(0);
    expect(client.trending).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('writes nothing in the demo', async () => {
    const { store, repo } = fakeStore();
    await expect(recordTrendingAdds(repo, now, true)).resolves.toBe(0);
    expect(store.hasDay).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('saves nothing when Sleeper fails, and leaves the caller to log it', async () => {
    const { store, repo } = fakeStore();
    client.trending.mockRejectedValue(new Error('Sleeper down'));
    await expect(recordTrendingAdds(repo, now, false)).rejects.toThrow('Sleeper down');
    expect(store.save).not.toHaveBeenCalled();
  });
});
