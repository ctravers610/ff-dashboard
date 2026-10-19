// Waivers for Sleeper leagues. Sleeper has no free-agent endpoint, so the
// available players are every NFL player nobody in the league has rostered,
// valued with Sleeper's weekly projections scored by the league's own settings.

import type { SourceError, WaiverLeague, WaiverPlayer, WaiverRules } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { NON_STARTER_SLOTS, toPlayer } from '../adapters/sleeper/mapper.js';
import type { SleeperLeague, SleeperPlayerMap, SleeperRoster } from '../adapters/sleeper/types.js';
import { HOUR } from '../cache.js';
import { scoreWithSettings, weeklyProjections } from '../scoring/projection.js';
import { waiverPlayer, type WaiverContext } from './context.js';
import { pickAvailable, startablePositions, suggestMoves } from './moves.js';

type Projections = Map<string, Record<string, number>>;

const WAIVER_TYPES: Record<number, WaiverRules['type']> = { 0: 'rolling', 1: 'reverse_standings', 2: 'faab' };

export function sleeperRules(league: SleeperLeague, mine: SleeperRoster, teams: number): WaiverRules | null {
  const type = WAIVER_TYPES[league.settings?.waiver_type ?? -1];
  if (!type) return null;
  const total = league.settings?.waiver_budget ?? null;
  return {
    type,
    faabTotal: type === 'faab' ? total : null,
    faabLeft: type === 'faab' && total != null ? total - (mine.settings.waiver_budget_used ?? 0) : null,
    priority: mine.settings.waiver_position ?? null,
    teams,
  };
}

/** Builds one league's waiver view from its rosters and the projections for the claim week onward. */
export function sleeperWaiverLeague(
  league: SleeperLeague,
  rosters: SleeperRoster[],
  mine: SleeperRoster,
  players: SleeperPlayerMap,
  weeks: Projections[], // claim week first, then each later week of the regular season
  ctx: WaiverContext,
): WaiverLeague {
  const scoring = league.scoring_settings ?? {};
  const value = (id: string): Pick<WaiverPlayer, 'week' | 'restOfSeason'> => {
    const perWeek = weeks.map((w) => scoreWithSettings(w.get(id) ?? {}, scoring));
    return { week: perWeek[0] ?? null, restOfSeason: perWeek.reduce((a, b) => a + b, 0) };
  };
  const toWaiver = (id: string, availability: WaiverPlayer['availability'] = null) => {
    const player = toPlayer(id, players);
    if (!player) return null;
    const v = value(id);
    return waiverPlayer(player, v.week, v.restOfSeason, ctx, availability);
  };

  const rostered = new Set(rosters.flatMap((r) => [...(r.players ?? []), ...(r.reserve ?? []), ...(r.taxi ?? [])]));
  const positions = startablePositions(league.roster_positions);
  const pool = Object.entries(players)
    .filter(([id, p]) => !rostered.has(id) && p.team && positions.has(p.position))
    .map(([id]) => toWaiver(id))
    .filter((p): p is WaiverPlayer => p != null);
  const available = pickAvailable(pool, positions);

  const starterSlots = league.roster_positions.filter((s) => !NON_STARTER_SLOTS.has(s));
  const starters = starterSlots.map((slot, i) => {
    const id = mine.starters?.[i];
    return { slot, player: id && id !== '0' ? toWaiver(id) : null };
  });
  const sidelined = new Set([...(mine.reserve ?? []), ...(mine.taxi ?? [])]);
  const starterIds = new Set(mine.starters ?? []);
  const bench = (mine.players ?? [])
    .filter((id) => !starterIds.has(id) && !sidelined.has(id))
    .map((id) => toWaiver(id))
    .filter((p): p is WaiverPlayer => p != null);

  const rosterSize = league.roster_positions.filter((s) => s !== 'IR' && s !== 'TAXI').length;
  const active = (mine.players ?? []).filter((id) => !sidelined.has(id)).length;
  const openRosterSpots = Math.max(0, rosterSize - active);

  return {
    leagueId: league.league_id,
    platform: 'sleeper',
    name: league.name,
    rules: sleeperRules(league, mine, rosters.length),
    moves: suggestMoves({ starters, bench, available, openRosterSpots, byeTeams: ctx.byeTeams }),
    available,
    openRosterSpots,
  };
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function fetchSleeperWaivers(usernames: string[], ctx: WaiverContext): Promise<{ leagues: WaiverLeague[]; errors: SourceError[] }> {
  const result = { leagues: [] as WaiverLeague[], errors: [] as SourceError[] };
  if (usernames.length === 0) return result;

  const weekNumbers = Array.from({ length: Math.max(0, ctx.lastWeek - ctx.week + 1) }, (_, i) => ctx.week + i);
  const [players, weeks] = await Promise.all([
    sleeperClient.players(),
    Promise.all(weekNumbers.map((w) => weeklyProjections(ctx.season, w, HOUR))),
  ]);

  const seen = new Set<string>(); // a league shared by two of your accounts is shown once
  await Promise.all(
    usernames.map(async (username) => {
      try {
        const user = await sleeperClient.user(username);
        if (!user?.user_id) throw new Error(`Sleeper user "${username}" was not found`);
        for (const league of await sleeperClient.leagues(user.user_id, ctx.season)) {
          if (seen.has(league.league_id)) continue;
          seen.add(league.league_id);
          const rosters = await sleeperClient.rosters(league.league_id);
          const mine = rosters.find((r) => r.owner_id === user.user_id || r.co_owners?.includes(user.user_id));
          if (mine) result.leagues.push(sleeperWaiverLeague(league, rosters, mine, players, weeks, ctx));
        }
      } catch (e) {
        result.errors.push({ source: `sleeper:${username}`, message: errorMessage(e) });
      }
    }),
  );
  return result;
}
