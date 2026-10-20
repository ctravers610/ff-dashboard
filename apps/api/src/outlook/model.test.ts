import { describe, expect, it } from 'vitest';
import { headToHead, simulate, strengths, type LeagueSeason, type SeasonTeam } from './model.js';

const team = (teamId: string, wins: number, losses: number, pointsFor: number): SeasonTeam => ({ teamId, name: teamId, wins, losses, ties: 0, pointsFor, results: [] });

describe('strengths', () => {
  it('pulls a small sample toward the league average', () => {
    const s = strengths([team('hot', 1, 0, 150), team('cold', 0, 1, 50)]);
    // League average 100; one game at 150 counts against three at 100.
    expect(s.get('hot')).toBeCloseTo(112.5);
    expect(s.get('cold')).toBeCloseTo(87.5);
  });
});

describe('headToHead', () => {
  it('is a coin flip between equals and favors the better scorer', () => {
    expect(headToHead(100, 100)).toBeCloseTo(0.5);
    expect(headToHead(120, 100)).toBeGreaterThan(0.7);
  });
});

describe('simulate', () => {
  const four = [team('a', 6, 0, 780), team('b', 3, 3, 660), team('c', 3, 3, 650), team('d', 0, 6, 540)];

  it('is certain once the season is decided', () => {
    const odds = simulate({ teams: four, remaining: [], playoffTeams: 2 });
    expect(odds.get('a')).toEqual({ playoffChance: 1, projectedWins: 6 });
    expect(odds.get('b')!.playoffChance).toBe(1); // 3-3, more points than c
    expect(odds.get('c')!.playoffChance).toBe(0);
  });

  it('gives a close race to the stronger team more often, and repeats exactly with the same seed', () => {
    const season: LeagueSeason = {
      teams: four,
      remaining: [
        { week: 7, a: 'a', b: 'd' },
        { week: 7, a: 'b', b: 'c' },
        { week: 8, a: 'a', b: 'c' },
        { week: 8, a: 'b', b: 'd' },
      ],
      playoffTeams: 2,
    };
    const odds = simulate(season);
    expect(odds.get('a')!.playoffChance).toBeGreaterThan(0.95);
    expect(odds.get('b')!.playoffChance).toBeGreaterThan(odds.get('c')!.playoffChance);
    expect(odds.get('d')!.playoffChance).toBeLessThan(0.05);
    expect(odds.get('a')!.projectedWins).toBeGreaterThan(6);
    expect(simulate(season)).toEqual(odds);
  });
});

describe('simulate with median games', () => {
  it('gives the top half an extra win each week', () => {
    const even = [team('a', 0, 0, 0), team('b', 0, 0, 0), team('c', 0, 0, 0), team('d', 0, 0, 0)];
    const odds = simulate({ teams: even, remaining: [{ week: 1, a: 'a', b: 'b' }, { week: 1, a: 'c', b: 'd' }], playoffTeams: 2, medianGames: true });
    // Two head-to-head wins and two median wins shared by four teams: 1 each on average.
    const total = [...odds.values()].reduce((n, o) => n + o.projectedWins, 0);
    expect(total).toBeCloseTo(4);
  });
});
