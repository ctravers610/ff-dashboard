// What every platform's waiver builder needs to know about the week.

import type { Player, WaiverPlayer } from '@ffd/shared';
import { playerKey } from '../exposure.js';

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
