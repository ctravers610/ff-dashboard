import type { Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { bestLineup, costlyCalls, lineupTotals, missedPickups, type RosteredPlayer } from './lineup.js';

const r = (name: string, position: string, points: number, startedAt: string | null = null): RosteredPlayer => ({
  player: { playerId: name, name, position, nflTeam: 'DAL', injuryStatus: null } as Player,
  points,
  startedAt,
});

const slots = ['QB', 'RB', 'WR', 'WR', 'FLEX'];
const roster = [
  r('QB One', 'QB', 20, 'QB'),
  r('Backup QB', 'QB', 25),
  r('RB One', 'RB', 12, 'RB'),
  r('RB Two', 'RB', 15),
  r('WR One', 'WR', 18, 'WR'),
  r('WR Two', 'WR', 4, 'WR'),
  r('WR Bench', 'WR', 11),
  r('TE Flex', 'TE', 3, 'FLEX'),
];

describe('bestLineup', () => {
  it('fills plain slots first, then the flex with the best player left', () => {
    const picks = bestLineup(slots, roster).map((s) => `${s.slot}:${s.pick?.player.name}`);
    expect(picks).toEqual(['QB:Backup QB', 'RB:RB Two', 'WR:WR One', 'WR:WR Bench', 'FLEX:RB One']);
  });

  it('leaves a slot empty when nobody can play it', () => {
    expect(bestLineup(['K'], roster)).toEqual([{ slot: 'K', pick: null }]);
  });
});

describe('lineupTotals', () => {
  it('compares what you scored with the best you could have', () => {
    // Started 20 + 12 + 18 + 4 + 3 = 57; best 25 + 15 + 18 + 11 + 12 = 81.
    expect(lineupTotals(slots, roster)).toEqual({ points: 57, best: 81, leftOnBench: 24 });
  });
});

describe('costlyCalls', () => {
  it('pairs each bench player who should have started with a starter he could replace, biggest cost first', () => {
    expect(costlyCalls(slots, roster).map((c) => [c.slot, c.started.name, c.better.name, c.cost])).toEqual([
      ['FLEX', 'TE Flex', 'RB Two', 12], // the 3-point TE in the flex, while a 15-point RB sat
      ['WR', 'WR Two', 'WR Bench', 7],
      ['QB', 'QB One', 'Backup QB', 5],
    ]);
  });

  it('is empty when you started the best lineup', () => {
    const perfect = [r('QB', 'QB', 20, 'QB'), r('RB', 'RB', 15, 'RB'), r('Bench RB', 'RB', 2)];
    expect(costlyCalls(['QB', 'RB'], perfect)).toEqual([]);
  });
});

describe('missedPickups', () => {
  it('finds the free agents worth starting, each in the spot that gives the most overall', () => {
    const freeAgents = [r('Waiver WR', 'WR', 24), r('Waiver RB', 'RB', 16), r('Waiver QB', 'QB', 21), r('Meh TE', 'TE', 5)];
    // The WR goes to WR (not the flex), leaving the flex for the RB; the QB's +1 is too small to mention.
    expect(missedPickups(slots, roster, freeAgents).map((c) => [c.slot, c.started.name, c.better.name, c.cost])).toEqual([
      ['WR', 'WR Two', 'Waiver WR', 20],
      ['FLEX', 'TE Flex', 'Waiver RB', 13],
    ]);
  });

  it('ignores near-ties', () => {
    expect(missedPickups(['WR'], [r('Starter', 'WR', 10, 'WR')], [r('FA', 'WR', 12)])).toEqual([]);
  });
});
