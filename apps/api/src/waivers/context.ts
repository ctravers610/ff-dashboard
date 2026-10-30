// What every platform's waiver builder needs to know about the week.

import type { Player, WaiverLeague, WaiverPlayer } from '@ffd/shared';
import { playerKey } from '../exposure.js';
import type { Lineup } from './moves.js';

/** One claim that won a player in a FAAB league, and what it bid. */
export interface WinningBid {
  player: Player | null; // null when the platform's player couldn't be named
  bid: number;
  week: number; // the week the claim played in
  losers?: number[]; // the bids that lost to it, where the platform shows them: empty when no one else bid
}

/**
 * A league's waiver view as the platform builders return it: plus, in FAAB
 * leagues, what prices players and sizes bids (see pricing.ts) and isn't sent to
 * the browser: this season's winning bids, what each other team has left, and
 * your lineup.
 */
export type WaiverLeagueWithBids = WaiverLeague & { winningBids?: WinningBid[]; rivalBalances?: number[]; lineup?: Lineup };

export interface WaiverContext {
  season: string;
  week: number; // the week a claim would play in
  lastWeek: number; // the last week of the regular season
  byeTeams: Set<string> | null; // teams without a game in the claim week; null if unknown
  trendingAdds: Map<string, number>; // by playerKey: Sleeper users who added him in the last day
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function waiverPlayer(
  player: Player,
  week: number | null,
  restOfSeason: number | null,
  ctx: WaiverContext,
  availability: WaiverPlayer['availability'] = null,
): WaiverPlayer {
  return {
    player,
    week: week == null ? null : round1(week),
    restOfSeason: restOfSeason == null ? null : round1(restOfSeason),
    availability,
    trendingAdds: ctx.trendingAdds.get(playerKey(player)) ?? null,
  };
}
