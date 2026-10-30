// Waivers for ESPN leagues, using ESPN's own free-agent list and its
// projections, which are already scored with the league's settings.

import type { PendingClaim, SourceError, WaiverLeague, WaiverPlayer, WaiverRules } from '@ffd/shared';
import { espnClient, espnSourceError, type EspnAuth } from '../adapters/espn/client.js';
import { BENCH_SLOT, findMyTeamId, IR_SLOT, SLOT_NAMES, SLOT_ORDER, toEspnPlayer } from '../adapters/espn/mapper.js';
import type { EspnFreeAgents, EspnLeague, EspnPlayer, EspnTransaction } from '../adapters/espn/types.js';
import { waiverPlayer, type WaiverContext, type WaiverLeagueWithBids } from './context.js';
import { espnSchedule } from './schedule.js';
import { pickAvailable, startablePositions, suggestMoves } from './moves.js';

// ESPN's player stats come as many rows; projections are statSourceId 1. The
// season-level projection row (scoringPeriodId 0, split 0) is rest of season:
// during the season it covers only the games still to play.
export function projection(p: EspnPlayer, season: number, week: number): Pick<WaiverPlayer, 'week' | 'restOfSeason'> {
  const find = (period: number, split: number) =>
    p.stats?.find((s) => s.seasonId === season && s.scoringPeriodId === period && s.statSourceId === 1 && (s.statSplitTypeId ?? split) === split)
      ?.appliedTotal ?? null;
  return { week: find(week, 1), restOfSeason: find(0, 0) };
}

export function espnRules(league: EspnLeague, myTeamId: number): WaiverRules {
  const acq = league.settings?.acquisitionSettings;
  const me = league.teams?.find((t) => t.id === myTeamId);
  const faab = acq?.isUsingAcquisitionBudget === true;
  const total = acq?.acquisitionBudget ?? null;
  return {
    type: faab ? 'faab' : acq?.waiverOrderReset === false ? 'rolling' : 'reverse_standings',
    faabTotal: faab ? total : null,
    faabLeft: faab && total != null ? total - (me?.transactionCounter?.acquisitionBudgetSpent ?? 0) : null,
    priority: me?.waiverRank ?? null,
    teams: league.teams?.length ?? 0,
  };
}

export function espnWaiverLeague(league: EspnLeague, freeAgents: EspnFreeAgents, myTeamId: number, name: string, ctx: WaiverContext): WaiverLeagueWithBids {
  const season = Number(ctx.season);
  const toWaiver = (p: EspnPlayer, availability: WaiverPlayer['availability'] = null) => {
    const v = projection(p, season, ctx.week);
    return waiverPlayer(toEspnPlayer(p), v.week, v.restOfSeason, ctx, availability);
  };

  const slotCounts = league.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const starterSlots = SLOT_ORDER.flatMap((id) => Array<string>(slotCounts[id] ?? 0).fill(SLOT_NAMES[id] ?? String(id)));
  const positions = startablePositions(starterSlots);

  const pool = freeAgents.players
    .map((fa) => toWaiver(fa.player, fa.status === 'WAIVERS' ? 'waivers' : 'free_agent'))
    .filter((p) => p.player.nflTeam && positions.has(p.player.position));
  const available = pickAvailable(pool, positions);

  const entries = league.teams?.find((t) => t.id === myTeamId)?.roster?.entries ?? [];
  const withPlayer = entries.filter((e) => e.playerPoolEntry?.player);
  // Starters in lineup order, with an empty spot wherever a slot isn't filled.
  const starters = SLOT_ORDER.flatMap((id) => {
    const filled = withPlayer.filter((e) => e.lineupSlotId === id).map((e) => toWaiver(e.playerPoolEntry!.player));
    const count = slotCounts[id] ?? 0;
    return Array.from({ length: count }, (_, i) => ({ slot: SLOT_NAMES[id] ?? String(id), player: filled[i] ?? null }));
  });
  const bench = withPlayer.filter((e) => e.lineupSlotId === BENCH_SLOT).map((e) => toWaiver(e.playerPoolEntry!.player));

  const rosterSize = Object.entries(slotCounts)
    .filter(([id]) => Number(id) !== IR_SLOT)
    .reduce((n, [, count]) => n + count, 0);
  const openRosterSpots = Math.max(0, rosterSize - withPlayer.filter((e) => e.lineupSlotId !== IR_SLOT).length);

  return {
    leagueId: String(league.id),
    platform: 'espn',
    name,
    rules: espnRules(league, myTeamId),
    moves: suggestMoves({ starters, bench, available, openRosterSpots, byeTeams: ctx.byeTeams }),
    available,
    lineup: { starters, bench },
    openRosterSpots,
    runs: [],
    runsSource: null,
    claims: null,
  };
}

/**
 * Your claims still waiting for a run. ESPN never updates a claim: processing it
 * (won, failed or canceled) adds a transaction that points back at it, and the
 * claim itself stays PENDING, so those are left out.
 */
export function myPendingClaims(transactions: EspnTransaction[], myTeamId: number): EspnTransaction[] {
  const resolved = new Set(transactions.map((t) => t.relatedTransactionId).filter(Boolean));
  return transactions.filter(
    (t) => t.type === 'WAIVER' && t.status === 'PENDING' && t.teamId === myTeamId && !(t.id && resolved.has(t.id)),
  );
}

/**
 * Your pending claims, with names and projections. ESPN gives only player ids,
 * so they're looked up on the league's rosters and free agents, and any left
 * over are fetched by id.
 */
export async function espnPendingClaims(
  claims: EspnTransaction[],
  league: EspnLeague,
  freeAgents: EspnFreeAgents,
  faab: boolean,
  ctx: WaiverContext,
  fetchPlayers: (ids: number[]) => Promise<EspnPlayer[]>,
): Promise<PendingClaim[]> {
  const known = new Map<number, EspnPlayer>();
  for (const t of league.teams ?? []) for (const e of t.roster?.entries ?? []) if (e.playerPoolEntry?.player) known.set(e.playerPoolEntry.player.id, e.playerPoolEntry.player);
  for (const fa of freeAgents.players) known.set(fa.player.id, fa.player);
  const ids = claims.flatMap((c) => (c.items ?? []).map((i) => i.playerId));
  const missing = [...new Set(ids.filter((id) => !known.has(id)))];
  if (missing.length) for (const p of await fetchPlayers(missing).catch(() => [])) known.set(p.id, p);

  const season = Number(ctx.season);
  const toWaiver = (id: number | undefined): WaiverPlayer | null => {
    const p = id == null ? undefined : known.get(id);
    if (!p) return null;
    const v = projection(p, season, ctx.week);
    return waiverPlayer(toEspnPlayer(p), v.week, v.restOfSeason, ctx);
  };
  return [...claims]
    .sort((a, b) => (a.proposedDate ?? 0) - (b.proposedDate ?? 0))
    .flatMap((c) => {
      const add = toWaiver(c.items?.find((i) => i.type === 'ADD')?.playerId);
      if (!add) return [];
      return [{ add, drop: toWaiver(c.items?.find((i) => i.type === 'DROP')?.playerId), bid: faab ? (c.bidAmount ?? 0) : null }];
    });
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function fetchEspnWaivers(
  leagueIds: string[],
  auth: EspnAuth | null,
  ctx: WaiverContext,
): Promise<{ leagues: WaiverLeagueWithBids[]; errors: SourceError[]; pendingClaims: Map<string, number> }> {
  const result = { leagues: [] as WaiverLeagueWithBids[], errors: [] as SourceError[], pendingClaims: new Map<string, number>() };
  await Promise.all(
    leagueIds.map(async (leagueId) => {
      try {
        if (!auth) throw new Error('Set ESPN_S2 and ESPN_SWID in .env to see ESPN waivers');
        const [league, freeAgents] = await Promise.all([
          espnClient.rostersForWeek(leagueId, ctx.season, ctx.week, auth),
          espnClient.freeAgents(leagueId, ctx.season, ctx.week, auth),
        ]);
        const myTeamId = findMyTeamId(league, auth.swid);
        if (myTeamId == null) throw new Error(`Couldn't find your team in ESPN league ${leagueId} (check ESPN_SWID)`);
        // The name lives in mSettings, which this request includes.
        const name = league.settings?.name ?? `ESPN league ${leagueId}`;
        const schedule = await espnSchedule(leagueId, ctx.season, ctx.week, auth, league);
        // Your own claims for the coming run, so reminders can skip a league you've already handled.
        const pending = await espnClient.pendingTransactions(leagueId, ctx.season, ctx.week, auth).catch(() => null);
        const base = espnWaiverLeague(league, freeAgents, myTeamId, name, ctx);
        let pendingClaims: PendingClaim[] | null = null;
        if (pending) {
          const mine = myPendingClaims(pending.transactions ?? [], myTeamId);
          result.pendingClaims.set(String(league.id), mine.length);
          const fetchPlayers = (ids: number[]) => espnClient.players(leagueId, ctx.season, ctx.week, ids, auth).then((r) => r.players.map((p) => p.player));
          pendingClaims = await espnPendingClaims(mine, league, freeAgents, base.rules?.type === 'faab', ctx, fetchPlayers);
        }
        const budget = league.settings?.acquisitionSettings?.acquisitionBudget ?? 0;
        const rivalBalances = (league.teams ?? []).filter((t) => t.id !== myTeamId).map((t) => budget - (t.transactionCounter?.acquisitionBudgetSpent ?? 0));
        result.leagues.push({ ...base, ...schedule, pendingClaims, rivalBalances });
      } catch (e) {
        result.errors.push(espnSourceError(leagueId, e));
      }
    }),
  );
  return result;
}
