// GET /api/waivers: for each league, your waiver budget and priority, the best
// available players, and suggested add/drop moves for the week a claim made now
// would play in. FFPC leagues come from a pasted copy of FFPC's add/drop page.

import { nextRun, type WaiverClaims, type WaiverLeague, type WaiversResponse } from '@ffd/shared';
import { reminderKey } from '../reminders/plan.js';
import { reminderRepo } from '../reminders/store.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { config } from '../config.js';
import { playerKey } from '../exposure.js';
import { nflGames } from '../scoring/games.js';
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

  const results = await Promise.all([
    fetchSleeperWaivers(config.sleeperUsernames, ctx),
    fetchEspnWaivers(config.espnLeagueIds, config.espnAuth, ctx),
    fetchFfpcWaivers(ctx),
  ]);
  const [, espn] = results;
  const leagues = await withClaims(results.flatMap((r) => r.leagues), espn.pendingClaims);
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
    const next = nextRun(league.runs, now);
    if (!next) return { ...league, claims: null };
    const pending = league.platform === 'espn' ? (espnPending.get(league.leagueId) ?? null) : null;
    const yours = state.get(reminderKey(league.platform, league.leagueId, next.at))?.claimsSetAt;
    const claims: WaiverClaims = {
      runAt: next.at.toISOString(),
      set: Boolean(pending) || Boolean(yours),
      source: pending ? 'espn' : yours ? 'you' : null,
      pending,
    };
    return { ...league, claims };
  });
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
