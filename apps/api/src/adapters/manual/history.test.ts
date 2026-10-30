import type { LeagueSummary, ManualLeague, ManualMatchup } from '@ffd/shared';
import { describe, expect, it, vi } from 'vitest';
import type { GameScore } from '../../scoring/games.js';
import { liveScorer } from '../../scoring/live.js';
import { FFPC_RULES } from '../../scoring/rules.js';
import type { SleeperPlayerMap } from '../sleeper/types.js';
import { ffpcPastWeeks, pastesToRescore, rescoreWeek } from './history.js';
import { buildPlayerIndex } from './parse.js';
import type { manualLeagueRepo } from './store.js';

const players: SleeperPlayerMap = {
  '1': { name: 'Drake Maye', position: 'QB', team: 'NE', injury_status: null },
  '2': { name: 'Brock Purdy', position: 'QB', team: 'SF', injury_status: null },
  '3': { name: 'Mike Evans', position: 'WR', team: 'TB', injury_status: null },
  SEA: { name: 'Seattle Seahawks', position: 'DEF', team: 'SEA', injury_status: null },
};
const index = buildPlayerIndex(players);

// Final stats for the week, by player name.
const final: Record<string, number> = { 'Drake Maye': 30, 'Seattle Seahawks': 7, 'Brock Purdy': 12.5, 'Mike Evans': 18 };
const scorer = (p: { name: string }) => ({ points: final[p.name] ?? 0, projected: final[p.name] ?? 0 });

// Week 7 of 2026: NE plays Sunday at 1, SF on Sunday night, SEA on Monday night.
// The week ends Tuesday, October 27, at 9 AM Eastern.
const game = (kickoff: string | null): GameScore => ({ opponent: 'X', opponentScore: 0, started: true, progress: 1, kickoff });
const games = new Map([
  ['NE', game('2026-10-25T17:00:00Z')],
  ['SF', game('2026-10-26T00:20:00Z')],
  ['SEA', game('2026-10-27T00:15:00Z')],
]);

const paste = (week: number, capturedAt: string, extra: Partial<ManualMatchup> = {}): ManualMatchup => ({
  week,
  capturedAt,
  me: {
    teamName: 'Sample Squad',
    points: 26.15,
    starters: [
      { slot: 'QB', name: 'Drake Maye', points: 26.15 },
      { slot: 'DEF', name: 'SEA DST', points: 0 },
    ],
  },
  opponent: { teamName: 'Rival', points: 0, starters: [{ slot: 'QB', name: 'Brock Purdy', points: 0 }] },
  ...extra,
});

const league: ManualLeague = {
  id: 'L1',
  waiversCapturedAt: null,
  platform: 'ffpc',
  name: 'Big Gorilla Tourney #104790',
  teamName: 'Sample Squad',
  rosterText: 'QB Drake Maye\nBN Mike Evans',
  updatedAt: '2026-10-18T00:00:00Z',
  matchup: null,
};

describe('rescoreWeek', () => {
  it('scores both lineups from final stats, graded as exact once every starter had kicked off', () => {
    const row = rescoreWeek(league, paste(7, '2026-10-27T01:00:00Z'), '2026', index, scorer, games);
    expect(row).toMatchObject({
      platform: 'ffpc',
      leagueId: 'L1',
      leagueName: 'Sample Squad',
      season: '2026',
      week: 7,
      points: 37,
      opponentName: 'Rival',
      opponentPoints: 12.5,
      allPlayRank: null,
      estimated: false,
    });
  });

  it("is an estimate when a starter's game hadn't kicked off yet: he could have been swapped out", () => {
    // Sunday afternoon: Purdy (Sunday night) and Seattle (Monday night) were still open.
    const row = rescoreWeek(league, paste(7, '2026-10-25T20:00:00Z'), '2026', index, scorer, games);
    expect(row).toMatchObject({ points: 37, opponentPoints: 12.5, estimated: true });
  });

  it('is an estimate when a starter had no game or could not be matched to a player', () => {
    const onBye = paste(7, '2026-10-27T01:00:00Z');
    onBye.me.starters.push({ slot: 'WR', name: 'Mike Evans', points: 0 }); // TB isn't on the schedule
    expect(rescoreWeek(league, onBye, '2026', index, scorer, games)).toMatchObject({ points: 55, estimated: true });

    const unknown = paste(7, '2026-10-27T01:00:00Z');
    unknown.me.starters.push({ slot: 'WR', name: 'Nobody Atall', points: 4 }); // keeps the pasted points
    expect(rescoreWeek(league, unknown, '2026', index, scorer, games)).toMatchObject({ points: 41, estimated: true });
  });

  describe('all-play week', () => {
    // Week 6 ends Tuesday, October 20. All three kickoffs are before Monday 01:00Z.
    const week6 = new Map([
      ['NE', game('2026-10-18T17:00:00Z')],
      ['SF', game('2026-10-18T20:25:00Z')],
      ['SEA', game('2026-10-19T00:20:00Z')],
    ]);
    const scoreboard = [
      { teamName: 'Sample Squad', points: 30, projected: 33 },
      { teamName: 'Rival', points: 12.5, projected: 14 },
      { teamName: 'Third', points: 36, projected: 36 },
      { teamName: 'Fourth', points: 20, projected: 45 }, // a Monday night player still to go
    ];

    it("uses the other teams' projections when pasted before the week ended, as an estimate", () => {
      const row = rescoreWeek(league, paste(6, '2026-10-19T01:00:00Z', { scoreboard }), '2026', index, scorer, week6);
      // 37 is behind Fourth's projected 45, ahead of Third's 36: second of four, top two win.
      expect(row).toMatchObject({ week: 6, points: 37, allPlayRank: 2, allPlayTeams: 4, allPlayWinSlots: 2, estimated: true });
    });

    it('uses the pasted scores when pasted after the week ended, graded as exact', () => {
      // Fourth finished on 35, well short of the 45 projected: 37 is now first.
      const done = scoreboard.map((t) => (t.teamName === 'Fourth' ? { ...t, points: 35 } : t));
      const row = rescoreWeek(league, paste(6, '2026-10-21T12:00:00Z', { scoreboard: done }), '2026', index, scorer, week6);
      expect(row).toMatchObject({ allPlayRank: 1, estimated: false });
    });
  });
});

describe('pastesToRescore', () => {
  const at = (iso: string) => new Date(iso);
  // Each week pasted on its Sunday afternoon.
  const pastes = [5, 6, 7, 8].map((week) => paste(week, new Date(Date.UTC(2026, 9, 11 + 7 * (week - 5), 20)).toISOString()));

  it('picks finished weeks without a final score, and ones pasted again since their row was written', () => {
    const captures = [5, 6, 7].map((week) => ({ week, capturedAt: at(`2026-10-${14 + 7 * (week - 5)}T20:00:00Z`) })); // each Wednesday
    expect(pastesToRescore(pastes, [], captures, 8).map((p) => p.week)).toEqual([]);
    expect(pastesToRescore(pastes, [7], captures, 8).map((p) => p.week)).toEqual([7]);

    // Week 6's final page, pasted the Thursday after its row was written.
    const repasted = pastes.map((p) => (p.week === 6 ? { ...p, capturedAt: '2026-10-22T20:00:00Z' } : p));
    expect(pastesToRescore(repasted, [], captures, 8).map((p) => p.week)).toEqual([6]);
  });

  it('fills a week with a paste but no row, and never touches the current week', () => {
    expect(pastesToRescore(pastes, [5, 6, 7], [], 8).map((p) => p.week)).toEqual([5, 6, 7]);
    expect(pastesToRescore(pastes, [], [], 8).map((p) => p.week)).toEqual([5, 6, 7]);
  });
});

vi.mock('../sleeper/client.js', () => ({ sleeperClient: { players: vi.fn(async () => players) } }));
vi.mock('../../scoring/live.js', () => ({ liveScorer: vi.fn(async () => scorer) }));
vi.mock('../../scoring/games.js', () => ({ nflGames: vi.fn(async () => games) }));

describe('ffpcPastWeeks', () => {
  const summary = { platform: 'ffpc', leagueId: 'L1', name: 'Sample Squad', season: '2026', week: 8 } as LeagueSummary;
  const fakeStore = (pastes: ManualMatchup[]) =>
    ({ list: vi.fn().mockResolvedValue([league]), matchupWeeks: vi.fn().mockResolvedValue(pastes) }) as unknown as typeof manualLeagueRepo;

  it("re-scores the stale weeks it has a paste for, with that week's stats", async () => {
    const store = fakeStore([paste(7, '2026-10-25T20:00:00Z')]);
    const rows = await ffpcPastWeeks(summary, [3, 7], [], store);
    expect(store.matchupWeeks).toHaveBeenCalledWith('L1', '2026');
    expect(liveScorer).toHaveBeenLastCalledWith('2026', 7, FFPC_RULES);
    expect(rows.map((r) => [r.week, r.points, r.estimated])).toEqual([[7, 37, true]]);
  });

  it('does nothing for a league that has been deleted', async () => {
    const store = { list: vi.fn().mockResolvedValue([]), matchupWeeks: vi.fn() } as unknown as typeof manualLeagueRepo;
    expect(await ffpcPastWeeks(summary, [7], [], store)).toEqual([]);
    expect(store.matchupWeeks).not.toHaveBeenCalled();
  });
});
