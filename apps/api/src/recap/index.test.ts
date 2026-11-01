import { beforeEach, describe, expect, it, vi } from 'vitest';
import { yahooGet } from '../adapters/yahoo/client.js';
import { manualLeagueRepo } from '../adapters/manual/store.js';
import { getRecap, getRecapSeason } from './index.js';

vi.mock('../adapters/yahoo/client.js', () => ({ yahooGet: vi.fn() }));
vi.mock('../adapters/yahoo/index.js', () => ({
  yahooReady: async () => true,
  myYahooTeams: async () => [{ team: { teamKey: 't.1' }, league: { leagueKey: 'l.1', name: 'Annex', slots: ['QB'] } }],
}));
vi.mock('../adapters/yahoo/parse.js', () => ({ parseRoster: () => [], parseLeaguePlayers: () => [], parseMatchup: () => null }));
vi.mock('../adapters/sleeper/client.js', () => ({
  sleeperClient: { state: async () => ({ season: '2026', week: 9 }), players: async () => ({}) },
}));
vi.mock('../adapters/manual/store.js', () => ({ manualLeagueRepo: { list: vi.fn() } }));
vi.mock('../sources/store.js', () => ({ activeSources: async () => ({ sleeperUsernames: [], espnLeagueIds: [] }) }));
vi.mock('../scoring/games.js', () => ({ nflGames: async () => null })); // weeks 1-8 are finished
vi.mock('../scoring/live.js', () => ({ fetchStats: async () => new Map(), liveScorer: async () => () => ({ points: 0 }) }));

const yahooCalls = () => vi.mocked(yahooGet).mock.calls.length;

// The cache outlives each test, so each one looks at weeks of its own. The season view fills them all, so it goes last.
describe('recaps of finished weeks', () => {
  beforeEach(() => {
    vi.mocked(yahooGet).mockReset().mockResolvedValue({});
    vi.mocked(manualLeagueRepo.list).mockReset().mockResolvedValue([]);
  });

  it('asks the platforms once when the same week is picked again', async () => {
    const first = await getRecap(1);
    const calls = yahooCalls();
    expect(calls).toBeGreaterThan(0);
    await expect(getRecap(1)).resolves.toEqual(first);
    expect(yahooCalls()).toBe(calls);
  });

  it('tries a league again after it failed, instead of keeping the failure', async () => {
    vi.mocked(yahooGet).mockRejectedValueOnce(new Error('Yahoo is rate-limiting'));
    const failed = await getRecap(4);
    expect(failed.errors.map((e) => e.source)).toEqual(['yahoo:l.1']);
    expect(failed.leagues).toEqual([]);

    const retried = await getRecap(4);
    expect(retried.errors).toEqual([]);
    expect(retried.leagues.map((l) => l.leagueId)).toEqual(['l.1']);
  });

  it('shows a new FFPC paste at once, even when the week is already kept', async () => {
    expect((await getRecap(5)).leagues.map((l) => l.platform)).toEqual(['yahoo']);
    const calls = yahooCalls();

    const pasted = { id: 'f.1', name: 'FFPC', teamName: 'Mine', rosterText: '', matchup: { week: 5, me: { starters: [] }, opponent: { starters: [] } } };
    vi.mocked(manualLeagueRepo.list).mockResolvedValue([pasted] as never);
    expect((await getRecap(5)).leagues.map((l) => l.platform)).toEqual(['yahoo', 'ffpc']);
    expect(yahooCalls()).toBe(calls);
  });

  it('shares its weeks with the season view', async () => {
    await getRecapSeason();
    const calls = yahooCalls();
    await getRecap(2);
    await getRecap(3);
    expect(yahooCalls()).toBe(calls);
  });
});
