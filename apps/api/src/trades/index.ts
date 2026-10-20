// GET /api/trades?league=sleeper:123: every completed trade in a league this
// season, scored (see analyze.ts). Sleeper only for now: its transactions say
// exactly who got what. ESPN's feed shows accepted trades without the players
// in them, and FFPC has no feed at all.

import type { TradesResponse } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { NON_STARTER_SLOTS, toPlayer } from '../adapters/sleeper/mapper.js';
import type { SleeperLeague, SleeperTransaction } from '../adapters/sleeper/types.js';
import { cached, HOUR } from '../cache.js';
import { nflGames } from '../scoring/games.js';
import { fetchStats } from '../scoring/live.js';
import { scoreWithSettings, weeklyProjections } from '../scoring/projection.js';
import { activeSources } from '../sources/store.js';
import { analyzeTrade, replacementLevel, type Acquired, type SideInput } from './analyze.js';

// A finished week's stats don't change.
const pastStats = (season: string, week: number) => cached(`trades:stats:${season}:${week}`, 6 * HOUR, () => fetchStats(season, week));

async function findSleeperLeague(leagueId: string, season: string): Promise<{ league: SleeperLeague; myUserId: string } | null> {
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
  if (platform !== 'sleeper' || !leagueId) return { leagueKey, supported: false, trades: [] };

  const state = await sleeperClient.state();
  const found = await findSleeperLeague(leagueId, state.season);
  if (!found) return { leagueKey, supported: true, trades: [] };
  const { league, myUserId } = found;

  const lastWeek = (league.settings?.playoff_week_start ?? 15) - 1;
  // The latest week whose games are all over.
  const games = await nflGames(state.season, state.week).catch(() => null);
  const currentDone = games != null && games.size > 0 && [...games.values()].every((g) => g.progress >= 1);
  const lastDone = Math.min(lastWeek, currentDone ? state.week : state.week - 1);
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
  // started, everyone's points in league scoring, and replacement level.
  const first = Math.min(...trades.map((t) => t.leg ?? 1));
  const weeks = Array.from({ length: Math.max(0, lastDone - first + 1) }, (_, i) => first + i);
  const slots = league.roster_positions.filter((s) => !NON_STARTER_SLOTS.has(s));
  const scoring = league.scoring_settings ?? {};
  const byWeek = new Map(
    await Promise.all(
      weeks.map(async (w) => {
        const [matchups, stats] = await Promise.all([sleeperClient.matchups(leagueId, w), pastStats(state.season, w).catch(() => null)]);
        const points = new Map<string, number>();
        for (const [id, s] of stats ?? []) points.set(id, scoreWithSettings(s, scoring));
        for (const m of matchups) for (const [id, p] of Object.entries(m.players_points ?? {})) points.set(id, p); // the league's own numbers win
        const scores = [...points].flatMap(([id, p]) => {
          const player = toPlayer(id, players);
          return player ? [{ position: player.position, points: p }] : [];
        });
        return [w, { matchups, points, replacement: replacementLevel(scores, slots, league.total_rosters) }] as const;
      }),
    ),
  );

  // Rest of season: projections for the weeks left, for players still on the team that got them.
  const left = Array.from({ length: Math.max(0, lastWeek - lastDone) }, (_, i) => lastDone + 1 + i);
  const projections = await Promise.all(left.map((w) => weeklyProjections(state.season, w, HOUR).catch(() => null)));
  const restOfSeason = (id: string, rosterId: number) => {
    if (final || !rosters.find((r) => r.roster_id === rosterId)?.players?.includes(id)) return null;
    return projections.reduce((n, p) => n + (p?.get(id) ? scoreWithSettings(p.get(id)!, scoring) : 0), 0);
  };

  const side = (t: SleeperTransaction, rosterId: number): SideInput => ({
    teamName: teamName(rosterId),
    isMe: rosterId === myRoster,
    received: Object.entries(t.adds ?? {})
      .filter(([, to]) => to === rosterId)
      .flatMap(([id]): Acquired[] => {
        const player = toPlayer(id, players);
        if (!player) return [];
        const lines = new Map(
          weeks
            .filter((w) => w >= (t.leg ?? 1))
            .map((w) => {
              const week = byWeek.get(w)!;
              const mine = week.matchups.find((m) => m.roster_id === rosterId);
              const started = mine?.starters?.includes(id) ?? false;
              return [w, { points: week.points.get(id) ?? 0, onRoster: started || (mine?.players?.includes(id) ?? false), started }];
            }),
        );
        return [{ name: player.name, position: player.position, weeks: lines, restOfSeason: restOfSeason(id, rosterId) }];
      }),
    picks: ((t.draft_picks ?? []) as { season: string; round: number; owner_id: number }[]).filter((p) => p.owner_id === rosterId).map((p) => `${p.season} round ${p.round}`),
    faab: (t.waiver_budget ?? []).filter((b) => b.receiver === rosterId).reduce((n, b) => n + b.amount, 0),
  });

  const reports = trades
    .sort((a, b) => b.status_updated - a.status_updated)
    .map((t, i) => {
      const [a, b] = t.roster_ids!;
      return analyzeTrade(`${t.leg}:${i}`, t.leg ?? 0, [side(t, a!), side(t, b!)], (w, pos) => byWeek.get(w)?.replacement.get(pos) ?? 0, final);
    });
  return { leagueKey, supported: true, trades: reports };
}
