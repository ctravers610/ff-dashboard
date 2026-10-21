// Trades worth proposing: swaps that make both starting lineups better, judged
// by each player's projected points per week for the rest of the season in the
// league's own scoring. Tries every one-for-one swap with every team, and
// two-for-one deals both ways (consolidating depth into a starter, or the
// reverse). Pure; the loaders in finderData.ts gather rosters and projections.

import type { Player, TradeIdea, TradePiece } from '@ffd/shared';
import { bestLineup, type RosteredPlayer } from '../recap/lineup.js';

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Valued {
  player: Player;
  perWeek: number; // projected points a week, rest of season
}

export interface Team {
  teamName: string;
  players: Valued[];
}

/** What a roster's best starting lineup is worth a week. */
export function lineupValue(slots: string[], players: Valued[]): number {
  const rostered: RosteredPlayer[] = players.map((p) => ({ player: p.player, points: p.perWeek, startedAt: null }));
  return bestLineup(slots, rostered).reduce((n, s) => n + (s.pick?.points ?? 0), 0);
}

const piece = (v: Valued): TradePiece => ({ name: v.player.name, position: v.player.position, nflTeam: v.player.nflTeam, perWeek: round1(v.perWeek) });

/** Every pair from a list. */
function pairs<T>(list: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i]!, list[j]!]);
  return out;
}

/**
 * Trades that improve both lineups by at least `min` points a week, best for
 * you first among those that are good for both. At most `perPartner` from any
 * one team, so the list isn't all one partner.
 */
export function findTrades(slots: string[], me: Team, others: Team[], { min = 0.5, limit = 8, perPartner = 2 } = {}): TradeIdea[] {
  const mine = lineupValue(slots, me.players);
  const ideas: TradeIdea[] = [];
  for (const partner of others) {
    const theirs = lineupValue(slots, partner.players);
    const found: TradeIdea[] = [];
    const consider = (give: Valued[], get: Valued[]) => {
      const myAfter = lineupValue(slots, [...me.players.filter((p) => !give.includes(p)), ...get]);
      const theirAfter = lineupValue(slots, [...partner.players.filter((p) => !get.includes(p)), ...give]);
      const myGain = myAfter - mine;
      const theirGain = theirAfter - theirs;
      if (myGain >= min && theirGain >= min) {
        found.push({ partner: partner.teamName, give: give.map(piece), get: get.map(piece), myGain: round1(myGain), theirGain: round1(theirGain) });
      }
    };
    for (const g of me.players) for (const t of partner.players) consider([g], [t]);
    for (const two of pairs(me.players)) for (const t of partner.players) consider(two, [t]);
    for (const g of me.players) for (const two of pairs(partner.players)) consider([g], two);
    // Best for you that still helps them; ties go to the more even deal.
    found.sort((a, b) => b.myGain - a.myGain || Math.min(b.myGain, b.theirGain) - Math.min(a.myGain, a.theirGain));
    ideas.push(...found.slice(0, perPartner));
  }
  return ideas.sort((a, b) => b.myGain - a.myGain).slice(0, limit);
}
