// Hindsight for one week: the best lineup your roster could have fielded, and
// the start/sit calls that cost you. Pure functions; each platform's loader
// supplies the slots and every rostered player's points.

import type { CostlyCall, Player } from '@ffd/shared';
import { canPlay } from '../lineupAdvice.js';

export interface RosteredPlayer {
  player: Player;
  points: number;
  startedAt: string | null; // the slot he started in, or null if benched
}

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The highest-scoring legal lineup. Slots are filled from the most restrictive
 * (a plain WR slot) to the least (FLEX, then SUPER_FLEX), each with the best
 * player left who can play there. With nested slot rules like these, that
 * greedy order finds the true best lineup.
 */
export function bestLineup(slots: string[], players: RosteredPlayer[]): { slot: string; pick: RosteredPlayer | null }[] {
  const breadth = (slot: string) => POSITIONS.filter((p) => canPlay(slot, p)).length;
  const order = slots.map((slot, i) => ({ slot, i })).sort((a, b) => breadth(a.slot) - breadth(b.slot) || a.i - b.i);
  const used = new Set<RosteredPlayer>();
  const picks = new Array<{ slot: string; pick: RosteredPlayer | null }>(slots.length);
  for (const { slot, i } of order) {
    const pick = players.filter((p) => !used.has(p) && canPlay(slot, p.player.position)).sort((a, b) => b.points - a.points)[0] ?? null;
    if (pick) used.add(pick);
    picks[i] = { slot, pick };
  }
  return picks;
}

/**
 * Pairs each player who should have started with a starter who should have
 * sat, where he could legally take that starter's spot. A bipartite matching
 * (augmenting paths), so one pairing never blocks a better overall one: a
 * WR and an RB off the bench go to the WR and FLEX spots, not both chasing
 * the flex.
 */
function pairUp(better: RosteredPlayer[], worse: RosteredPlayer[]): [RosteredPlayer, RosteredPlayer][] {
  const owner = new Map<RosteredPlayer, RosteredPlayer>(); // worse → better
  const tryAssign = (b: RosteredPlayer, seen: Set<RosteredPlayer>): boolean => {
    for (const w of worse) {
      if (seen.has(w) || !canPlay(w.startedAt!, b.player.position)) continue;
      seen.add(w);
      const current = owner.get(w);
      if (!current || tryAssign(current, seen)) {
        owner.set(w, b);
        return true;
      }
    }
    return false;
  };
  for (const b of better) tryAssign(b, new Set());
  return [...owner.entries()].map(([w, b]) => [b, w]);
}

const toCall = (better: RosteredPlayer, started: RosteredPlayer): CostlyCall => ({
  slot: started.startedAt!,
  started: { name: started.player.name, points: round1(started.points) },
  better: { name: better.player.name, points: round1(better.points) },
  cost: round1(better.points - started.points),
});

/**
 * Bench players the best lineup would have started, each paired with a
 * starter whose spot he'd have taken, biggest cost first.
 */
export function costlyCalls(slots: string[], players: RosteredPlayer[]): CostlyCall[] {
  const best = new Set(bestLineup(slots, players).flatMap((s) => (s.pick ? [s.pick] : [])));
  const shouldHaveStarted = players.filter((p) => best.has(p) && !p.startedAt).sort((a, b) => b.points - a.points);
  const shouldHaveSat = players.filter((p) => p.startedAt && !best.has(p)).sort((a, b) => a.points - b.points);
  return pairUp(shouldHaveStarted, shouldHaveSat)
    .map(([b, s]) => toCall(b, s))
    .filter((c) => c.cost > 0)
    .sort((a, b) => b.cost - a.cost);
}

/** Totals for a week: what you scored and the best you could have. */
export function lineupTotals(slots: string[], players: RosteredPlayer[]) {
  const points = round1(players.filter((p) => p.startedAt).reduce((sum, p) => sum + p.points, 0));
  const best = round1(bestLineup(slots, players).reduce((sum, s) => sum + (s.pick?.points ?? 0), 0));
  return { points, best: Math.max(best, points), leftOnBench: round1(Math.max(0, best - points)) };
}

/**
 * Free agents who'd have been worth starting that week: the best lineup from
 * your starters plus everyone available, and which starters they'd have
 * replaced. Gaps under `min` points are left out, so near-ties don't clutter.
 */
export function missedPickups(slots: string[], starters: RosteredPlayer[], freeAgents: RosteredPlayer[], limit = 3, min = 3): CostlyCall[] {
  const pool = [...starters.filter((s) => s.startedAt), ...freeAgents.map((f) => ({ ...f, startedAt: null }))];
  return costlyCalls(slots, pool)
    .filter((c) => c.cost >= min)
    .slice(0, limit);
}
