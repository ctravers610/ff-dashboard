// GET /api/trade-finder?league=sleeper:123: trades that would help both your
// lineup and a leaguemate's (see finder.ts). Each player is valued at his
// projected points per week for the rest of the regular season, in the league's
// own scoring: Sleeper's projections run through the league's settings, or
// ESPN's own rest-of-season projection. FFPC has no other rosters to look at.

import type { TradeFinderResponse } from '@ffd/shared';
import { espnClient } from '../adapters/espn/client.js';
import { BENCH_SLOT, findMyTeamId, IR_SLOT, SLOT_NAMES, SLOT_ORDER, teamName as espnTeamName, toEspnPlayer } from '../adapters/espn/mapper.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { NON_STARTER_SLOTS, toPlayer } from '../adapters/sleeper/mapper.js';
import { HOUR } from '../cache.js';
import { config } from '../config.js';
import { nflGames } from '../scoring/games.js';
import { scoreWithSettings, weeklyProjections } from '../scoring/projection.js';
import { projection } from '../waivers/espn.js';
import { findTrades, type Team, type Valued } from './finder.js';
import { findSleeperLeague } from './index.js';

/** The first week still to play: this one until its games start, then the next. */
async function firstWeekLeft(season: string, week: number): Promise<number> {
  const games = await nflGames(season, week).catch(() => null);
  return games && [...games.values()].some((g) => g.started) ? week + 1 : week;
}

async function sleeperIdeas(leagueKey: string, leagueId: string): Promise<TradeFinderResponse> {
  const state = await sleeperClient.state();
  const found = await findSleeperLeague(leagueId, state.season);
  if (!found) return { leagueKey, supported: true, weeksLeft: 0, ideas: [] };
  const { league, myUserId } = found;

  const lastWeek = (league.settings?.playoff_week_start ?? 15) - 1;
  const from = await firstWeekLeft(state.season, state.week);
  const weeks = Array.from({ length: Math.max(0, lastWeek - from + 1) }, (_, i) => from + i);
  if (weeks.length === 0) return { leagueKey, supported: true, weeksLeft: 0, ideas: [] };

  const [users, rosters, players, projections] = await Promise.all([
    sleeperClient.leagueUsers(leagueId),
    sleeperClient.rosters(leagueId),
    sleeperClient.players(),
    Promise.all(weeks.map((w) => weeklyProjections(state.season, w, HOUR).catch(() => null))),
  ]);
  const scoring = league.scoring_settings ?? {};
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const teams = rosters.map((r): Team & { mine: boolean } => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
    const sidelined = new Set([...(r.reserve ?? []), ...(r.taxi ?? [])]);
    const valued = (r.players ?? [])
      .filter((id) => !sidelined.has(id))
      .flatMap((id): Valued[] => {
        const player = toPlayer(id, players);
        if (!player) return [];
        const total = projections.reduce((n, p) => n + (p?.get(id) ? scoreWithSettings(p.get(id)!, scoring) : 0), 0);
        return [{ player, perWeek: total / weeks.length }];
      });
    return {
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`,
      players: valued,
      mine: r.owner_id === myUserId || (r.co_owners?.includes(myUserId) ?? false),
    };
  });
  const me = teams.find((t) => t.mine);
  if (!me) return { leagueKey, supported: true, weeksLeft: weeks.length, ideas: [] };
  const slots = league.roster_positions.filter((s) => !NON_STARTER_SLOTS.has(s));
  return { leagueKey, supported: true, weeksLeft: weeks.length, ideas: findTrades(slots, me, teams.filter((t) => !t.mine)) };
}

async function espnIdeas(leagueKey: string, leagueId: string): Promise<TradeFinderResponse> {
  const auth = config.espnAuth;
  if (!auth) return { leagueKey, supported: false, weeksLeft: 0, ideas: [] };
  const state = await sleeperClient.state(); // the NFL week, as everywhere else in the app
  const league = await espnClient.rostersForWeek(leagueId, state.season, state.week, auth);
  const myTeamId = findMyTeamId(league, auth.swid);
  const lastWeek = league.settings?.scheduleSettings?.matchupPeriodCount ?? 14;
  const weeksLeft = Math.max(0, lastWeek - (await firstWeekLeft(state.season, state.week)) + 1);
  if (myTeamId == null || weeksLeft === 0) return { leagueKey, supported: true, weeksLeft, ideas: [] };

  const season = Number(state.season);
  const teams = (league.teams ?? []).map((t): Team & { mine: boolean } => ({
    teamName: espnTeamName(t),
    mine: t.id === myTeamId,
    players: (t.roster?.entries ?? [])
      .filter((e) => e.playerPoolEntry?.player && e.lineupSlotId !== IR_SLOT)
      .map((e) => {
        const p = e.playerPoolEntry!.player;
        // ESPN's season projection covers the games still to play.
        return { player: toEspnPlayer(p), perWeek: (projection(p, season, state.week).restOfSeason ?? 0) / weeksLeft };
      }),
  }));
  const counts = league.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const slots = SLOT_ORDER.filter((id) => id !== BENCH_SLOT && id !== IR_SLOT).flatMap((id) =>
    Array<string>(counts[id] ?? 0).fill(SLOT_NAMES[id] ?? String(id)),
  );
  const me = teams.find((t) => t.mine)!;
  return { leagueKey, supported: true, weeksLeft, ideas: findTrades(slots, me, teams.filter((t) => !t.mine)) };
}

export async function getTradeIdeas(leagueKey: string): Promise<TradeFinderResponse> {
  const [platform, leagueId] = leagueKey.split(':');
  if (platform === 'sleeper' && leagueId) return sleeperIdeas(leagueKey, leagueId);
  if (platform === 'espn' && leagueId) return espnIdeas(leagueKey, leagueId);
  return { leagueKey, supported: false, weeksLeft: 0, ideas: [] };
}
