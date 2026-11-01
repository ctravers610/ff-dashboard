// GET /api/trades?league=sleeper:123: every completed trade in a league this
// season, scored (see analyze.ts). Sleeper, Yahoo (yahoo.ts) and ESPN (espn.ts):
// each says exactly who got what. FFPC has no feed at all.

import type { TradesResponse } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { NON_STARTER_SLOTS, toPlayer } from '../adapters/sleeper/mapper.js';
import type { SleeperLeague, SleeperTransaction } from '../adapters/sleeper/types.js';
import { HOUR } from '../cache.js';
import { scoreWithSettings, weeklyProjections } from '../scoring/projection.js';
import { activeSources } from '../sources/store.js';
import { analyzeTrade, tradeSide, type LeagueWeeks } from './analyze.js';
import { espnTrades } from './espn.js';
import { lastFinishedWeek, pastStats } from './weeks.js';
import { yahooTrades } from './yahoo.js';

export async function findSleeperLeague(leagueId: string, season: string): Promise<{ league: SleeperLeague; myUserId: string } | null> {
  for (const username of (await activeSources()).sleeperUsernames) {
    const user = await sleeperClient.user(username);
    if (!user?.user_id) continue;
    const league = (await sleeperClient.leagues(user.user_id, season)).find((l) => l.league_id === leagueId);
    if (league) return { league, myUserId: user.user_id };
  }
  return null;
}

export async function getTrades(leagueKey: string): Promise<TradesResponse> {
  const [platform, leagueId] = leagueKey.split(':');
  if (platform === 'yahoo' && leagueId) return yahooTrades(leagueId);
  if (platform === 'espn' && leagueId) return espnTrades(leagueId);
  if (platform !== 'sleeper' || !leagueId) return { leagueKey, supported: false, trades: [] };

  const state = await sleeperClient.state();
  const found = await findSleeperLeague(leagueId, state.season);
  if (!found) return { leagueKey, supported: true, trades: [] };
  const { league, myUserId } = found;

  const lastWeek = (league.settings?.playoff_week_start ?? 15) - 1;
  const lastDone = await lastFinishedWeek(state.season, state.week, lastWeek);
  const final = state.week > lastWeek;

  const weeksSoFar = Array.from({ length: Math.min(state.week, lastWeek) }, (_, i) => i + 1);
  const trades = (await Promise.all(weeksSoFar.map((w) => sleeperClient.transactions(leagueId, w).catch(() => [] as SleeperTransaction[]))))
    .flat()
    .filter((t) => t.type === 'trade' && t.status === 'complete' && (t.roster_ids?.length ?? 0) === 2);
  if (trades.length === 0) return { leagueKey, supported: true, trades: [] };

  const [users, rosters, players] = await Promise.all([sleeperClient.leagueUsers(leagueId), sleeperClient.rosters(leagueId), sleeperClient.players()]);
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const teamName = (rosterId: number) => {
    const owner = usersById.get(rosters.find((r) => r.roster_id === rosterId)?.owner_id ?? '');
    return owner?.metadata?.team_name || owner?.display_name || `Team ${rosterId}`;
  };
  const myRoster = rosters.find((r) => r.owner_id === myUserId || r.co_owners?.includes(myUserId))?.roster_id;

  // Every week from the first trade to the last finished one: who each team had and
  // started, and everyone's points in league scoring.
  const first = Math.min(...trades.map((t) => t.leg ?? 1));
  const weeks = Array.from({ length: Math.max(0, lastDone - first + 1) }, (_, i) => first + i);
  const left = Array.from({ length: Math.max(0, lastWeek - lastDone) }, (_, i) => lastDone + 1 + i);
  const scoring = league.scoring_settings ?? {};
  const byWeek = new Map(
    await Promise.all(
      weeks.map(async (w) => {
        const [matchups, stats] = await Promise.all([sleeperClient.matchups(leagueId, w), pastStats(state.season, w).catch(() => null)]);
        const points = new Map<string, number>();
        for (const [id, s] of stats ?? []) points.set(id, scoreWithSettings(s, scoring));
        for (const m of matchups) for (const [id, p] of Object.entries(m.players_points ?? {})) points.set(id, p); // the league's own numbers win
        return [w, { matchups, points }] as const;
      }),
    ),
  );
  const projections = new Map(await Promise.all([...weeks, ...left].map(async (w) => [w, await weeklyProjections(state.season, w, HOUR).catch(() => null)] as const)));
  const projected = (w: number, id: string) => {
    const stats = projections.get(w);
    return stats ? scoreWithSettings(stats.get(id) ?? {}, scoring) : null;
  };
  const positionOf = (id: string) => toPlayer(id, players)?.position ?? '';

  const season: LeagueWeeks = {
    slots: league.roster_positions.filter((s) => !NON_STARTER_SLOTS.has(s)),
    finished: weeks,
    left,
    final,
    teamWeek: (w, teamId) => {
      const week = byWeek.get(w);
      const mine = week?.matchups.find((m) => String(m.roster_id) === teamId);
      if (!week || !mine) return null;
      const them = mine.matchup_id == null ? undefined : week.matchups.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id);
      const starters = (mine.starters ?? []).filter((id) => id !== '0'); // '0' is an empty slot
      return {
        players: [...new Set([...starters, ...(mine.players ?? [])])].map((id) => ({ id, position: positionOf(id), points: week.points.get(id) ?? 0, projected: projected(w, id), started: starters.includes(id) })),
        score: mine.points,
        opponent: them ? { id: String(them.roster_id), name: teamName(them.roster_id), score: them.points } : null,
      };
    },
    tradedPlayer: (w, id) => ({ points: byWeek.get(w)?.points.get(id) ?? 0, projected: projected(w, id) }),
    rosterAhead: (w, teamId) => (rosters.find((r) => String(r.roster_id) === teamId)?.players ?? []).map((id) => ({ id, position: positionOf(id), projected: projected(w, id) })),
  };

  const side = (t: SleeperTransaction, rosterId: number) => {
    const moves = Object.entries(t.adds ?? {}).flatMap(([id, to]) => {
      const player = toPlayer(id, players);
      return player ? [{ id, name: player.name, position: player.position, toTeamId: String(to) }] : [];
    });
    return tradeSide({ id: String(rosterId), name: teamName(rosterId), isMe: rosterId === myRoster }, moves, t.leg ?? 1, season, {
      picks: ((t.draft_picks ?? []) as { season: string; round: number; owner_id: number }[]).filter((p) => p.owner_id === rosterId).map((p) => `${p.season} round ${p.round}`),
      faab: (t.waiver_budget ?? []).filter((b) => b.receiver === rosterId).reduce((n, b) => n + b.amount, 0),
    });
  };

  const reports = trades
    .sort((a, b) => b.status_updated - a.status_updated)
    .map((t, i) => {
      const [a, b] = t.roster_ids!;
      return analyzeTrade(`${t.leg}:${i}`, t.leg ?? 0, [side(t, a!), side(t, b!)], final);
    });
  return { leagueKey, supported: true, trades: reports };
}
