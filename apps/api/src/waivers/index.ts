// GET /api/waivers: for each league, your waiver budget and priority, the best
// available players, and suggested add/drop moves for the week a claim made now
// would play in. FFPC leagues come from a pasted copy of FFPC's add/drop page.

import type { ByeWeeksResponse, WaiverLeague, WaiversResponse } from '@ffd/shared';
import { addDropStale } from '../reminders/ffpcPaste.js';
import { claimStatus } from '../reminders/plan.js';
import { reminderRepo } from '../reminders/store.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { config } from '../config.js';
import { activeSources } from '../sources/store.js';
import { playerKey } from '../exposure.js';
import { byes, byeWeeks, nflGames } from '../scoring/games.js';
import type { WaiverContext } from './context.js';
import { fetchEspnWaivers } from './espn.js';
import { fetchFfpcWaivers } from './ffpc.js';
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

  const sources = await activeSources();
  const results = await Promise.all([
    fetchSleeperWaivers(sources.sleeperUsernames, ctx),
    fetchEspnWaivers(sources.espnLeagueIds, config.espnAuth, ctx),
    fetchFfpcWaivers(ctx),
  ]);
  const [, espn] = results;
  const now = new Date();
  const leagues = (await withClaims(results.flatMap((r) => r.leagues), espn.pendingClaims)).map((l) =>
    l.platform === 'ffpc' ? { ...l, pasteStale: addDropStale(l, now) } : l,
  );
  return {
    season: state.season,
    week,
    lastRegularWeek: LAST_REGULAR_WEEK,
    leagues,
    errors: results.flatMap((r) => r.errors),
  };
}

/** Whether your claims are in for each league's next run: ESPN tells us; elsewhere you say so. */
async function withClaims(leagues: WaiverLeague[], espnPending: Map<string, number>, now = new Date()): Promise<WaiverLeague[]> {
  const state = await reminderRepo.upcoming(now).catch(() => new Map());
  return leagues.map((league) => {
    const pending = league.platform === 'espn' ? (espnPending.get(league.leagueId) ?? null) : null;
    return { ...league, claims: claimStatus(league, state, pending, now) };
  });
}

/** GET /api/byes: who's on bye in each week from the claim week to the end of the regular season. */
export async function getByeWeeks(): Promise<ByeWeeksResponse> {
  const state = await sleeperClient.state();
  const thisWeek = await nflGames(state.season, state.week).catch(() => null);
  const from = Math.min(claimWeek(state.week, thisWeek), LAST_REGULAR_WEEK);
  const all = await byeWeeks(state.season, from, LAST_REGULAR_WEEK);
  return {
    season: state.season,
    weeks: all.flatMap(({ week, teams }) => (teams ? [{ week, teams: [...teams] }] : [])),
  };
}
