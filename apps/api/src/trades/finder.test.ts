import type { Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { findTrades, lineupValue, type Valued } from './finder.js';

const p = (name: string, position: string, perWeek: number): Valued => ({
  player: { playerId: name, name, position, nflTeam: 'KC', injuryStatus: null } as Player,
  perWeek,
});

// One QB, one RB, one WR start.
const slots = ['QB', 'RB', 'WR'];

describe('lineupValue', () => {
  it('counts only the best player at each slot', () => {
    expect(lineupValue(slots, [p('Q', 'QB', 20), p('R1', 'RB', 15), p('R2', 'RB', 12), p('W', 'WR', 10)])).toBe(45);
  });
});

describe('findTrades', () => {
  // I'm deep at RB and weak at WR; they're the opposite.
  const me = { teamName: 'Me', players: [p('My QB', 'QB', 20), p('RB One', 'RB', 16), p('RB Two', 'RB', 14), p('Weak WR', 'WR', 6)] };
  const them = { teamName: 'Them', players: [p('Their QB', 'QB', 18), p('Weak RB', 'RB', 5), p('WR One', 'WR', 15), p('WR Two', 'WR', 13)] };

  it('finds the swap that fixes both weak spots, best for you first', () => {
    const [best] = findTrades(slots, me, [them]);
    // RB Two (14) for WR One (15): my WR goes 6 -> 15 (+9); their RB goes 5 -> 14
    // while their WR drops 15 -> 13 (+7).
    expect(best).toMatchObject({ partner: 'Them', give: [{ name: 'RB Two' }], get: [{ name: 'WR One' }], myGain: 9, theirGain: 7 });
  });

  it('skips trades that only help one side', () => {
    const ideas = findTrades(slots, me, [them]);
    expect(ideas.every((i) => i.myGain >= 0.5 && i.theirGain >= 0.5)).toBe(true);
    expect(ideas.some((i) => i.get.some((g) => g.name === 'WR One') && i.give.every((g) => g.name === 'Weak WR'))).toBe(false);
  });

  it('considers two-for-one deals: depth for a star', () => {
    // With a FLEX, my depth (RB 12 + WR 14) is worth more to a top-heavy team
    // with holes than their star RB is, and the star is worth more to me.
    const flex = ['QB', 'RB', 'WR', 'FLEX'];
    const mine = { teamName: 'Me', players: [p('My QB', 'QB', 20), p('OK RB', 'RB', 12), p('Spare RB', 'RB', 11), p('Good WR', 'WR', 14), p('Spare WR', 'WR', 13)] };
    const star = { teamName: 'Star', players: [p('Q2', 'QB', 18), p('Star RB', 'RB', 25), p('Bad WR', 'WR', 2)] };
    const deal = findTrades(flex, mine, [star]).find((i) => i.give.length === 2);
    expect(deal).toMatchObject({ give: [{ name: 'OK RB' }, { name: 'Good WR' }], get: [{ name: 'Star RB' }], myGain: 10, theirGain: 1 });
  });

  it('finds nothing when no swap helps both', () => {
    expect(findTrades(slots, me, [{ teamName: 'Clone', players: me.players.map((x) => ({ ...x })) }])).toEqual([]);
  });
});
