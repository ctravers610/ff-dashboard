import type { ManualLeague } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { SleeperPlayerMap } from '../sleeper/types.js';
import { toManualSummary } from './index.js';
import { buildPlayerIndex } from './parse.js';

const players: SleeperPlayerMap = {
  '1': { name: 'Drake Maye', position: 'QB', team: 'NE', injury_status: null },
  '2': { name: 'Brock Purdy', position: 'QB', team: 'SF', injury_status: null },
  '3': { name: 'Mike Evans', position: 'WR', team: 'SF', injury_status: 'Questionable' },
  SEA: { name: 'Seattle Seahawks', position: 'DEF', team: 'SEA', injury_status: null },
};
const index = buildPlayerIndex(players);

const league = (week: number): ManualLeague => ({
  id: 'L1',
  platform: 'ffpc',
  name: 'Test',
  teamName: 'Sample Squad',
  rosterText: 'QB Drake Maye\nBN Mike Evans',
  updatedAt: '2026-10-18T00:00:00Z',
  matchup: {
    week,
    capturedAt: '2026-10-19T20:00:00Z',
    me: {
      teamName: 'Sample Squad',
      points: 31.15,
      starters: [
        { slot: 'QB', name: 'Drake Maye', points: 26.15 },
        { slot: 'DEF', name: 'SEA DST', points: 5 },
      ],
    },
    opponent: { teamName: 'Rival', points: 20, starters: [{ slot: 'QB', name: 'Brock Purdy', points: 20 }] },
  },
});

describe('toManualSummary', () => {
  it('turns a pasted matchup for the current week into a resolved matchup', () => {
    const summary = toManualSummary(league(6), index, { season: '2026', week: 6 });
    expect(summary.matchup?.me.starters.map((s) => [s.slot, s.player?.name, s.points])).toEqual([
      ['QB', 'Drake Maye', 26.15],
      ['DEF', 'Seattle Seahawks', 5],
    ]);
    expect(summary.matchup?.opponent).toMatchObject({ teamName: 'Rival', points: 20 });
    expect(summary.manual?.matchupCapturedAt).toBe('2026-10-19T20:00:00Z');
  });

  it("hides last week's matchup once the NFL week moves on", () => {
    const summary = toManualSummary(league(5), index, { season: '2026', week: 6 });
    expect(summary.matchup).toBeNull();
    expect(summary.manual?.matchupCapturedAt).toBeNull();
  });

  const live = { 'Drake Maye': 30, 'Seattle Seahawks': 7, 'Brock Purdy': 12.5 } as Record<string, number>;
  const scorer = (p: { name: string }) => ({ points: live[p.name] ?? 0, projected: (live[p.name] ?? 0) + 2 });

  it('replaces snapshot points with live ones and adds projections when a scorer is available', () => {
    const summary = toManualSummary(league(6), index, { season: '2026', week: 6 }, scorer);
    expect(summary.matchup?.me.starters.map((s) => [s.points, s.projected])).toEqual([
      [30, 32],
      [7, 9],
    ]);
    expect(summary.matchup?.me).toMatchObject({ points: 37, projected: 41 });
    expect(summary.matchup?.opponent?.points).toBe(12.5);
    expect(summary.manual?.liveScored).toBe(true);
  });

  it("falls back to FFPC's pasted projection without a live feed", () => {
    const withProj = league(6);
    withProj.matchup!.me.projected = 150.54;
    expect(toManualSummary(withProj, index, { season: '2026', week: 6 }).matchup?.me.projected).toBe(150.54);
  });

  it('ranks the all-play week from the pasted scoreboard plus my live score', () => {
    const allPlayLeague = league(6);
    allPlayLeague.matchup!.scoreboard = [
      { teamName: 'Sample Squad', points: 20, projected: 30 },
      { teamName: 'Rival', points: 10, projected: 25 },
      { teamName: 'Third', points: 35, projected: 40 },
      { teamName: 'Fourth', points: 5, projected: 10 },
    ];
    const allPlay = toManualSummary(allPlayLeague, index, { season: '2026', week: 6 }, scorer).matchup?.allPlay;
    expect(allPlay?.teams.map((t) => [t.teamName, t.points])).toEqual([
      ['Sample Squad', 37],
      ['Third', 35],
      ['Rival', 12.5],
      ['Fourth', 5],
    ]);
    expect([allPlay?.myRank, allPlay?.winSlots]).toEqual([1, 2]);
  });

  it('only treats FFPC week 6 as all-play', () => {
    const notAllPlay = league(7);
    notAllPlay.matchup!.scoreboard = [{ teamName: 'Sample Squad', points: 20, projected: 30 }];
    expect(toManualSummary(notAllPlay, index, { season: '2026', week: 7 }).matchup?.allPlay).toBeNull();
  });

  it('still builds the roster and alerts without a matchup', () => {
    const summary = toManualSummary({ ...league(6), matchup: null }, index, { season: '2026', week: 6 });
    expect(summary.roster.map((r) => [r.player.name, r.status])).toEqual([
      ['Drake Maye', 'starter'],
      ['Mike Evans', 'bench'],
    ]);
  });
});
