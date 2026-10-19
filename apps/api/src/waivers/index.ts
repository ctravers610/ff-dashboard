// GET /api/waivers: for each Sleeper and ESPN league, your waiver budget and
// priority, the best available players, and suggested add/drop moves for the
// week a claim made now would play in. FFPC is left out: it has no API.

import type { WaiversResponse } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { config } from '../config.js';
import { playerKey } from '../exposure.js';
import { nflGames } from '../scoring/games.js';
import type { WaiverContext } from './context.js';
import { fetchEspnWaivers } from './espn.js';
import { claimWeek, LAST_REGULAR_WEEK } from './moves.js';
import { fetchSleeperWaivers } from './sleeper.js';

async function trendingAdds(): Promise<Map<string, number>> {
  const [trending, players] = await Promise.all([sleeperClient.trending('add'), sleeperClient.players()]);
  const byKey = new Map<string, number>();
  for (const { player_id, count } of trending) {
    const player = toPlayer(player_id, players);
    if (player) byKey.set(playerKey(player), count);
  }
  return byKey;
}

export async function getWaivers(): Promise<WaiversResponse> {
  const state = await sleeperClient.state();
  const thisWeek = await nflGames(state.season, state.week).catch(() => null);
  const week = Math.min(claimWeek(state.week, thisWeek), LAST_REGULAR_WEEK);

  // Byes and trends make the advice better but aren't essential.
  const [claimWeekGames, trending] = await Promise.all([
    nflGames(state.season, week).catch(() => null),
    trendingAdds().catch(() => new Map<string, number>()),
  ]);
  const ctx: WaiverContext = {
    season: state.season,
    week,
    lastWeek: LAST_REGULAR_WEEK,
    byeTeams: claimWeekGames ? byes(claimWeekGames) : null,
    trendingAdds: trending,
  };

  const results = await Promise.all([
    fetchSleeperWaivers(config.sleeperUsernames, ctx),
    fetchEspnWaivers(config.espnLeagueIds, config.espnAuth, ctx),
  ]);
  return {
    season: state.season,
    week,
    lastRegularWeek: LAST_REGULAR_WEEK,
    leagues: results.flatMap((r) => r.leagues),
    errors: results.flatMap((r) => r.errors),
  };
}

const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
];

/** Teams with no game in a week's schedule are on bye. */
export function byes(games: Map<string, unknown>): Set<string> | null {
  if (games.size === 0) return null; // no schedule: can't tell
  const out = new Set(NFL_TEAMS.filter((t) => !games.has(t)));
  if (out.has('WAS')) out.add('WSH'); // ESPN's code for Washington
  return out;
}
