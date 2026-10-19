import type { MatchupSide } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { buildAllPlay, totalSide } from './common.js';

const side = (teamName: string, points: number, projected: number | null): MatchupSide => ({
  teamId: teamName,
  teamName,
  points,
  projected,
  starters: [],
});

// Pasted earlier in the day; names truncated to 13 characters like FFPC's board.
const board = [
  { teamName: 'SR21', points: 120, projected: 166 },
  { teamName: 'Club 223', points: 118, projected: 151 },
  { teamName: 'Perfect Seaso', points: 115, projected: 115 },
  { teamName: 'Owl Mojo', points: 131, projected: 137 },
];

describe('buildAllPlay', () => {
  it('ranks every team, using live numbers for my matchup and pasted ones for the rest', () => {
    const allPlay = buildAllPlay(board, side('Club 223', 140.45, 150.54), side('SR21', 140.7, 165.9))!;
    expect(allPlay.teams.map((t) => [t.teamName, t.points, t.live])).toEqual([
      ['SR21', 140.7, true],
      ['Club 223', 140.45, true],
      ['Owl Mojo', 131, false],
      ['Perfect Seaso', 115, false],
    ]);
    expect(allPlay.winSlots).toBe(2);
    expect(allPlay.myRank).toBe(2);
    expect(allPlay.myProjectedRank).toBe(2);
  });

  it('matches truncated board names to full team names', () => {
    const allPlay = buildAllPlay(board, side('Perfect Season 2026', 150, 160), null)!;
    expect(allPlay.myRank).toBe(1);
    expect(allPlay.teams[0]).toMatchObject({ teamName: 'Perfect Season 2026', isMe: true });
  });

  it('returns null when my team is not on the board', () => {
    expect(buildAllPlay(board, side('Someone Else', 100, 100), null)).toBeNull();
  });
});

describe('totalSide', () => {
  it('sums points, and projections only when every starter has one', () => {
    const slot = (points: number, projected: number | null) => ({ slot: 'WR', player: null, points, projected });
    expect(totalSide([slot(10.1, 12), slot(5.25, 9.5)])).toEqual({ points: 15.35, projected: 21.5 });
    expect(totalSide([slot(10, 12), slot(5, null)])).toEqual({ points: 15, projected: null });
  });
});
