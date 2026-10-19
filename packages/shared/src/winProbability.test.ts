import { describe, expect, it } from 'vitest';
import type { Matchup } from './index';
import { chanceToWin, normalCdf, winProbability } from './winProbability';

const side = (points: number, projected: number | null) => ({ teamId: 'x', teamName: 'x', points, projected, starters: [] });
const matchup = (me: [number, number | null], them: [number, number | null]): Matchup => ({ week: 6, me: side(...me), opponent: side(...them) });

describe('normalCdf', () => {
  it('matches the standard normal table', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe('chanceToWin', () => {
  it('gets surer as the games finish, for the same lead', () => {
    const early = chanceToWin(10, 220); // a full week still to play
    const late = chanceToWin(10, 20); // a kicker and a defense left
    expect(early).toBeCloseTo(0.655, 2);
    expect(late).toBeCloseTo(0.908, 2); // 10 points against a ±7.5 spread
  });

  it('is certain once nothing is left to score', () => {
    expect(chanceToWin(0.4, 0)).toBe(1);
    expect(chanceToWin(-0.4, 0)).toBe(0);
    expect(chanceToWin(0, 0)).toBe(0.5);
  });
});

describe('winProbability', () => {
  it('uses projected margin and the points still to come', () => {
    // Projected to win by 10 with 200 projected points left between the teams.
    const p = winProbability(matchup([10, 115], [0, 105]))!;
    expect(p).toBeGreaterThan(0.6);
    expect(p).toBeLessThan(0.7);
  });

  it('treats a finished matchup as decided', () => {
    expect(winProbability(matchup([93.9, 93.9], [69.1, 69.1]))).toBe(1);
  });

  it('falls back to current points without projections', () => {
    expect(winProbability(matchup([80, null], [80, null]))).toBe(0.5);
  });

  it('judges an all-play week against the win line', () => {
    const allPlay: Matchup = {
      week: 6,
      me: side(100, 130),
      opponent: null,
      allPlay: {
        winSlots: 2,
        myRank: 2,
        myProjectedRank: 2,
        teams: [
          { teamName: 'A', points: 120, projected: 150, isMe: false, live: true },
          { teamName: 'Me', points: 100, projected: 130, isMe: true, live: true },
          { teamName: 'B', points: 90, projected: 110, isMe: false, live: true },
          { teamName: 'C', points: 80, projected: 100, isMe: false, live: true },
        ],
      },
    };
    // Top 2 of 4 win: I need to beat B's projected 110, and I'm projected 130.
    expect(winProbability(allPlay)!).toBeGreaterThan(0.8);
  });

  it('is unknown with no opponent', () => {
    expect(winProbability({ week: 6, me: side(80, 90), opponent: null })).toBeNull();
    expect(winProbability(null)).toBeNull();
  });
});
