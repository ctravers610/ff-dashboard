import type { DashboardResponse, LeagueSummary, Platform, Player, SourceError } from '@ffd/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboard } from '../dashboard.js';
import { fetchStats } from '../scoring/live.js';
import { FFPC_RULES } from '../scoring/rules.js';
import { scoreStats } from '../scoring/score.js';
import type { FeedEvent } from './feed.js';
import { pollLive, resetLive } from './service.js';

vi.mock('../dashboard.js', () => ({ getDashboard: vi.fn() }));
vi.mock('../scoring/games.js', () => ({ nflGames: vi.fn(async () => new Map()) }));
vi.mock('../scoring/live.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../scoring/live.js')>()), fetchStats: vi.fn() }));
vi.mock('../sources/store.js', () => ({ activeSources: vi.fn(async () => ({ sleeperUsernames: [] })) }));
vi.mock('../adapters/sleeper/client.js', () => ({
  sleeperClient: {
    players: vi.fn(async () => ({
      100: { name: 'Christian Watson', position: 'WR', team: 'GB' },
      200: { name: 'Jordan Love', position: 'QB', team: 'GB' },
      300: { name: 'Sam Darnold', position: 'QB', team: 'SEA' },
    })),
  },
}));

const player = (playerId: string, name: string, position: string): Player => ({ playerId, name, position, nflTeam: null, injuryStatus: null });
const watson = player('100', 'Christian Watson', 'WR');
const yahooWatson = player('nfl.p.100', 'Christian Watson', 'WR');
const yahooLove = player('nfl.p.200', 'Jordan Love', 'QB');
const yahooDarnold = player('nfl.p.300', 'Sam Darnold', 'QB');

const league = (platform: Platform, leagueId: string, name: string, extra: Partial<LeagueSummary> = {}): LeagueSummary => ({
  leagueId,
  platform,
  account: 'me',
  name,
  season: '2026',
  week: 8,
  myTeamId: 'me',
  standings: [],
  matchup: null,
  alerts: [],
  roster: [],
  ...extra,
});

// Watson starts in Club 223 (FFPC) and in Annex League (Yahoo). Love starts only in Annex.
const club = league('ffpc', 'club-223', 'Club 223', {
  matchup: { week: 8, me: { teamId: 'me', teamName: 'Me', points: 0, starters: [{ slot: 'WR', player: watson, points: 0 }] }, opponent: null },
  manual: { leagueName: 'Club 223', teamName: 'Me', updatedAt: '', unmatched: [], matchupCapturedAt: null, liveScored: true },
});
const annex = (lovePoints = 10) =>
  league('yahoo', '461.l.99', 'Annex League', {
    matchup: {
      week: 8,
      me: {
        teamId: 'me',
        teamName: 'Me',
        points: 0,
        starters: [
          { slot: 'QB', player: yahooLove, points: lovePoints },
          { slot: 'WR', player: yahooWatson, points: 3 },
        ],
      },
      opponent: { teamId: 'them', teamName: 'Them', points: 0, starters: [{ slot: 'QB', player: yahooDarnold, points: 8 }] },
    },
  });

const yahooDown: SourceError = { source: 'yahoo:461.l.99', message: 'Yahoo is rate-limiting this app' };
const catchFor14 = { rec: 1, rec_yd: 14 };

// One look at the week, with what the dashboard and the stat feed say at that moment.
const store = { add: vi.fn(async () => {}), recent: vi.fn(async () => []) };
function poll(leagues: LeagueSummary[], stats: Record<string, Record<string, number>> = {}, errors: SourceError[] = [], week = 8) {
  const dashboard: DashboardResponse = { season: '2026', week, updatedAt: '', leagues, players: [], errors };
  vi.mocked(getDashboard).mockResolvedValue(dashboard);
  vi.mocked(fetchStats).mockResolvedValue(new Map(Object.entries(stats)));
  return pollLive(store);
}

const eventFor = (events: FeedEvent[], name: string) => events.find((e) => e.player.name === name);
const leaguesOf = (event: FeedEvent | undefined) => event?.leagues.map((l) => [l.leagueName, l.role, l.points]);

beforeEach(() => {
  resetLive();
  store.add.mockClear();
});

describe('pollLive when a league fails to load', () => {
  it('keeps listing the league on plays, by its last good roster, with points pending', async () => {
    await poll([club, annex()]);
    const events = await poll([club], { 100: catchFor14, 200: { pass_td: 1 }, 300: { pass_td: 1 } }, [yahooDown]);

    expect(leaguesOf(eventFor(events, 'Christian Watson'))).toEqual([
      ['Club 223', 'starter', scoreStats(catchFor14, 'WR', FFPC_RULES)],
      ['Annex League', 'starter', null],
    ]);
    expect(leaguesOf(eventFor(events, 'Jordan Love'))).toEqual([['Annex League', 'starter', null]]);
    expect(leaguesOf(eventFor(events, 'Sam Darnold'))).toEqual([['Annex League', 'opponent', null]]);
    expect(store.add).toHaveBeenCalledWith('2026', 8, events);
  });

  it('keeps listing it for as long as the failure lasts', async () => {
    await poll([club, annex()]);
    await poll([club], {}, [yahooDown]);
    await poll([club], {}, [yahooDown]);
    const events = await poll([club], { 200: { pass_td: 1 } }, [yahooDown]);
    expect(leaguesOf(eventFor(events, 'Jordan Love'))).toEqual([['Annex League', 'starter', null]]);
  });

  it.each([
    ['a Yahoo league', annex(), 'yahoo:461.l.99', 'starter'],
    ['all of Yahoo', annex(), 'yahoo', 'starter'],
    ['an ESPN league', league('espn', '55', 'Massholes', { roster: [{ player: yahooLove, status: 'bench' }] }), 'espn:55', 'bench'],
    ['a Sleeper account', league('sleeper', '77', 'Sleeper League', { roster: [{ player: player('200', 'Jordan Love', 'QB'), status: 'bench' }] }), 'sleeper:someone', 'bench'],
    ['the hand-entered leagues', { ...club, roster: [{ player: player('200', 'Jordan Love', 'QB'), status: 'bench' as const }] }, 'manual', 'bench'],
  ])('recognizes %s failing', async (_, failed, source, role) => {
    await poll([failed]);
    const events = await poll([], { 200: { pass_td: 1 } }, [{ source, message: 'down' }]);
    expect(leaguesOf(eventFor(events, 'Jordan Love'))).toEqual([[failed.name, role, null]]);
  });
});

describe('pollLive when a failed league comes back', () => {
  it('stays quiet about what it missed, then reports later changes normally', async () => {
    await poll([club, annex(10)]);
    await poll([club], {}, [yahooDown]);

    // Back with 12 more points than before it failed: a new starting point, not a play.
    expect(await poll([club, annex(22)])).toEqual([]);
    expect(store.add).toHaveBeenLastCalledWith('2026', 8, []);

    const events = await poll([club, annex(28)], { 200: { pass_td: 1 } });
    expect(leaguesOf(eventFor(events, 'Jordan Love'))).toEqual([['Annex League', 'starter', 6]]);
  });

  it('doesn’t credit the missed points to a play on the look it comes back', async () => {
    await poll([club, annex(10)]);
    await poll([club], {}, [yahooDown]);
    const events = await poll([club, annex(22)], { 200: { pass_td: 1 } });
    expect(leaguesOf(eventFor(events, 'Jordan Love'))).toEqual([['Annex League', 'starter', null]]);
  });

  it('counts a platform catching up after the failure once', async () => {
    await poll([club, annex(10)]);
    await poll([club], { 200: { pass_td: 1 } }, [yahooDown]);
    await poll([club, annex(10)], { 200: { pass_td: 1 } });
    const events = await poll([club, annex(16)], { 200: { pass_td: 1 } });
    expect(leaguesOf(eventFor(events, 'Jordan Love'))).toEqual([['Annex League', 'starter', 6]]);
    expect(await poll([club, annex(16)], { 200: { pass_td: 1 } })).toEqual([]);
  });
});

describe('pollLive when a league is gone', () => {
  it('drops a league no error reports as failing', async () => {
    await poll([club, annex()]);
    const events = await poll([club], { 100: catchFor14, 200: { pass_td: 1 } });
    expect(leaguesOf(eventFor(events, 'Christian Watson'))).toEqual([['Club 223', 'starter', scoreStats(catchFor14, 'WR', FFPC_RULES)]]);
    expect(eventFor(events, 'Jordan Love')).toBeUndefined();
  });

  it('isn’t fooled by another source failing', async () => {
    await poll([club, annex()]);
    const events = await poll([club], { 200: { pass_td: 1 } }, [
      { source: 'espn:55', message: 'down' },
      { source: 'yahoo:461.l.1', message: 'down' },
      { source: 'live-scoring', message: 'down' },
    ]);
    expect(eventFor(events, 'Jordan Love')).toBeUndefined();
  });

  it('doesn’t bring a dropped league back when its source fails later', async () => {
    await poll([club, annex()]);
    await poll([club]);
    const events = await poll([club], { 200: { pass_td: 1 } }, [{ source: 'yahoo', message: 'down' }]);
    expect(eventFor(events, 'Jordan Love')).toBeUndefined();
  });

  it('forgets last week’s leagues, even while the source is failing', async () => {
    await poll([club, annex()], {}, [], 8);
    expect(await poll([club], { 200: { pass_td: 1 } }, [yahooDown], 9)).toEqual([]); // a new week's first look
    const events = await poll([club], { 200: { pass_td: 2 } }, [yahooDown], 9);
    expect(eventFor(events, 'Jordan Love')).toBeUndefined();
  });
});

describe('pollLive after a restart', () => {
  it('only sets the starting point, even with a league failing', async () => {
    await poll([club, annex()]);
    resetLive();

    expect(await poll([club], { 100: catchFor14, 200: { pass_td: 3 } }, [yahooDown])).toEqual([]);
    expect(store.add).not.toHaveBeenCalled();

    // Nothing is remembered from before the restart, so there's no roster to list until Annex loads.
    const events = await poll([club], { 100: catchFor14, 200: { pass_td: 4 } }, [yahooDown]);
    expect(eventFor(events, 'Jordan Love')).toBeUndefined();
  });
});
