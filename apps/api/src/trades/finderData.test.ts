import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EspnLeague, EspnRosterEntry } from '../adapters/espn/types.js';
import { espnClient } from '../adapters/espn/client.js';
import { nflGames } from '../scoring/games.js';
import { getTradeIdeas } from './finderData.js';

const SWID = '{ME}';
const SEASON = 2026;

vi.mock('../config.js', () => ({ config: { espnAuth: { espnS2: 's2', swid: '{ME}' } } }));
vi.mock('./index.js', () => ({ findSleeperLeague: vi.fn() }));
vi.mock('../adapters/sleeper/client.js', () => ({ sleeperClient: { state: vi.fn(async () => ({ season: '2026', week: 8 })) } }));
vi.mock('../scoring/games.js', () => ({ nflGames: vi.fn() }));
vi.mock('../adapters/espn/client.js', () => ({ espnClient: { rostersForWeek: vi.fn() } }));

const POSITION_ID = { QB: 1, RB: 2, WR: 3 };
const SLOT_ID = { QB: 0, RB: 2, WR: 4 };

// A player as ESPN sends him when asked for one week: that week's projection,
// if he has one, and a rest-of-season row running well past the fantasy season.
function entry(id: number, name: string, position: keyof typeof POSITION_ID, points: (week: number) => number | null, week: number): EspnRosterEntry {
  const projected = points(week);
  return {
    playerId: id,
    lineupSlotId: SLOT_ID[position],
    playerPoolEntry: {
      player: {
        id,
        fullName: name,
        defaultPositionId: POSITION_ID[position],
        proTeamId: 12,
        stats: [
          ...(projected == null ? [] : [{ seasonId: SEASON, scoringPeriodId: week, statSourceId: 1, statSplitTypeId: 1, appliedTotal: projected }]),
          { seasonId: SEASON, scoringPeriodId: 0, statSourceId: 1, statSplitTypeId: 0, appliedTotal: 500 },
        ],
      },
    },
  };
}

const flat = (points: number) => () => points;

// Deep at RB and weak at WR, against the opposite: the swap of RB Two for WR One
// takes my WR 6 -> 15 (+9) and their RB 5 -> 14 while their WR drops 15 -> 13 (+7).
function league(week: number, rbTwo: (week: number) => number | null = flat(14), matchupPeriodCount = 11): EspnLeague {
  return {
    id: 1,
    seasonId: SEASON,
    scoringPeriodId: week,
    status: { currentMatchupPeriod: week },
    settings: {
      name: 'League',
      scheduleSettings: { matchupPeriodCount },
      rosterSettings: { lineupSlotCounts: { '0': 1, '2': 1, '4': 1, '20': 3 } },
    },
    members: [{ id: SWID, displayName: 'me' }],
    teams: [
      {
        id: 1,
        name: 'Mine',
        owners: [SWID],
        roster: {
          entries: [
            entry(1, 'My QB', 'QB', flat(20), week),
            entry(2, 'RB One', 'RB', flat(16), week),
            entry(3, 'RB Two', 'RB', rbTwo, week),
            entry(4, 'Weak WR', 'WR', flat(6), week),
          ],
        },
      },
      {
        id: 2,
        name: 'Theirs',
        owners: ['{THEM}'],
        roster: {
          entries: [
            entry(5, 'Their QB', 'QB', flat(18), week),
            entry(6, 'Weak RB', 'RB', flat(5), week),
            entry(7, 'WR One', 'WR', flat(15), week),
            entry(8, 'WR Two', 'WR', flat(13), week),
          ],
        },
      },
    ],
  } as EspnLeague;
}

const started = new Map([['KC', { started: true }]]) as unknown as Awaited<ReturnType<typeof nflGames>>;
const rosters = vi.mocked(espnClient.rostersForWeek);
const askedFor = () => rosters.mock.calls.map((c) => c[2]);

beforeEach(() => {
  rosters.mockReset();
  vi.mocked(nflGames).mockResolvedValue(started);
});

describe('getTradeIdeas for ESPN', () => {
  it('values players by their weekly projections over the regular-season weeks left, not the rest-of-season row', async () => {
    rosters.mockImplementation(async (_league, _season, week) => league(week));
    const { weeksLeft, ideas } = await getTradeIdeas('espn:1');
    expect(weeksLeft).toBe(3);
    expect(new Set(askedFor())).toEqual(new Set([8, 9, 10, 11]));
    expect(ideas[0]).toMatchObject({ partner: 'Theirs', give: [{ name: 'RB Two' }], get: [{ name: 'WR One' }], myGain: 9, theirGain: 7 });
  });

  it('averages the weeks, with a bye or a missing row as 0', async () => {
    // 42 and two weeks off average 14, the same as a flat 14.
    const rbTwo = (week: number) => (week === 10 ? 0 : week === 11 ? null : 42);
    rosters.mockImplementation(async (_league, _season, week) => league(week, rbTwo));
    const { ideas } = await getTradeIdeas('espn:1');
    expect(ideas[0]).toMatchObject({ give: [{ name: 'RB Two' }], get: [{ name: 'WR One' }], myGain: 9, theirGain: 7 });
  });

  it('counts this week until its games start', async () => {
    vi.mocked(nflGames).mockResolvedValue(new Map());
    // 2 this week and 18 after average 14, the same as a flat 14; without this week he'd be 18.
    const rbTwo = (week: number) => (week === 8 ? 2 : 18);
    rosters.mockImplementation(async (_league, _season, week) => league(week, rbTwo));
    const { weeksLeft, ideas } = await getTradeIdeas('espn:1');
    expect(weeksLeft).toBe(4);
    expect(new Set(askedFor())).toEqual(new Set([8, 9, 10, 11]));
    expect(ideas[0]).toMatchObject({ give: [{ name: 'RB Two' }], get: [{ name: 'WR One' }], myGain: 9, theirGain: 7 });
  });

  it('counts a week it could not read as 0, as Sleeper leagues do', async () => {
    rosters.mockImplementation(async (_league, _season, week) => {
      if (week === 11) throw new Error('HTTP 500');
      return league(week);
    });
    const { weeksLeft, ideas } = await getTradeIdeas('espn:1');
    expect(weeksLeft).toBe(3);
    expect(ideas[0]!.myGain).toBeCloseTo(6, 1);
  });

  it('has nothing to suggest once the regular season is over', async () => {
    rosters.mockImplementation(async (_league, _season, week) => league(week, flat(14), 8));
    expect(await getTradeIdeas('espn:1')).toMatchObject({ supported: true, weeksLeft: 0, ideas: [] });
    expect(askedFor()).toEqual([8]);
  });
});
