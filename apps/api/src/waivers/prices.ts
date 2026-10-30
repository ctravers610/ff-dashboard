// Prices the available players in your FAAB leagues (the model is pricing.ts):
// gathers every league's winning bids, ranks each claimed player as of the
// week he was claimed, then prices each available player the same way.
//
// Yahoo keeps earlier seasons, so a Yahoo league's past seasons (followed back
// through the league each was renewed from) add their winning bids too, and with
// a YAHOO_COOKIE their losing bids. Those never change, so they're worked out in
// the background now and then and kept as claims only; until they're ready, prices
// come from this season alone.

import type { Player, WaiverLeague, WaiverPlayer } from '@ffd/shared';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import type { SleeperPlayerMap } from '../adapters/sleeper/types.js';
import { yahooGet } from '../adapters/yahoo/client.js';
import { errorMessage, yahooReady } from '../adapters/yahoo/index.js';
import { parseAdds, parseGameWeeks, parseLeagues, parseWaiverStanding, weekOn, type YahooLeagueInfo } from '../adapters/yahoo/parse.js';
import { yahooContestedClaims } from '../adapters/yahoo/web.js';
import { DAY, HOUR } from '../cache.js';
import { config } from '../config.js';
import { playerKey } from '../exposure.js';
import { fetchProjections, weeklyProjections } from '../scoring/projection.js';
import type { WaiverContext, WaiverLeagueWithBids, WinningBid } from './context.js';
import { bestUse, chooseBid, moveWorth, priceFor, pricePosition, projectedRanks, rivalBids, standardPoints, tieChance, withLosingBids, type PastClaim, type Target, type Use } from './pricing.js';
import { inferFaabBudget } from './yahoo.js';

type Projections = Map<string, Record<string, number>>;

const RANK_WEEKS = 4; // a player's rank is over the week he'd play and the three after it
const LAST_NFL_WEEK = 18;

/** Matches any platform's player to Sleeper's, whose ids the projections use. */
export function sleeperMatcher(players: SleeperPlayerMap) {
  const byKey = new Map<string, string>();
  for (const id of Object.keys(players)) {
    const p = toPlayer(id, players);
    if (p?.position) byKey.set(playerKey(p), id);
  }
  const positionOf = (id: string) => (players[id]?.position ? pricePosition(players[id]!.position) : null);
  const idOf = (platform: string, p: Player) =>
    platform === 'sleeper' ? p.playerId : (byKey.get(playerKey({ ...p, position: pricePosition(p.position) })) ?? null);
  return { idOf, positionOf };
}

/** Each asked-for week's positional ranks in a season, by Sleeper id. */
export async function ranksFor(weeks: number[], load: (week: number) => Promise<Projections>, positionOf: (id: string) => string | null): Promise<Map<number, Map<string, number>>> {
  const needed = [...new Set(weeks.flatMap((w) => Array.from({ length: RANK_WEEKS }, (_, i) => w + i)))].filter((w) => w >= 1 && w <= LAST_NFL_WEEK);
  // One week at a time, kept only as each player's points: a season of full projections is too big to hold.
  const points = new Map<number, Map<string, number>>();
  for (const w of needed) points.set(w, standardPoints(await load(w)));
  return new Map(weeks.map((w) => [w, projectedRanks(Array.from({ length: RANK_WEEKS }, (_, i) => points.get(w + i)).filter((p) => p != null), positionOf)]));
}

const leagueKey = (l: Pick<WaiverLeague, 'platform' | 'leagueId'>) => `${l.platform}:${l.leagueId}`;
const budgetOf = (l: WaiverLeague) => (l.rules?.type === 'faab' && l.rules.faabTotal ? l.rules.faabTotal : null);

const toPastClaim = (b: WinningBid, league: string, player: Player, rank: number, season: number, budget: number): PastClaim => ({
  league,
  position: pricePosition(player.position),
  rank,
  season,
  week: b.week,
  share: b.bid / budget,
  ...(b.losers ? { rivals: b.losers.map((bid) => bid / budget) } : {}),
});

/** This season's winning bids in every FAAB league, as past claims. */
async function currentClaims(leagues: WaiverLeagueWithBids[], ctx: WaiverContext, match: ReturnType<typeof sleeperMatcher>) {
  const faab = leagues.filter((l) => budgetOf(l) && l.winningBids?.length);
  const weeks = [...new Set([ctx.week, ...faab.flatMap((l) => l.winningBids!.map((b) => b.week))])];
  // Weeks gone by keep their projections, so they're cached for longer.
  const ranks = await ranksFor(weeks, (w) => weeklyProjections(ctx.season, w, w < ctx.week ? 6 * HOUR : HOUR), match.positionOf);
  const claims: PastClaim[] = faab.flatMap((l) =>
    l.winningBids!.flatMap((b) => {
      const id = b.player && match.idOf(l.platform, b.player);
      const rank = id ? ranks.get(b.week)?.get(id) : undefined;
      if (!b.player || !rank) return [];
      return [toPastClaim(b, leagueKey(l), b.player, rank, Number(ctx.season), budgetOf(l)!)];
    }),
  );
  return { claims, ranks };
}

/** One past season of a Yahoo league: its winning bids, and the bids that lost to them, as claims credited to this season's league. */
async function pastYahooSeason(past: YahooLeagueInfo, current: YahooLeagueInfo, match: ReturnType<typeof sleeperMatcher>): Promise<PastClaim[]> {
  const game = past.leagueKey.split('.l.')[0];
  const [transactions, teams, calendar] = await Promise.all([
    yahooGet(`league/${past.leagueKey}/transactions;types=add`),
    yahooGet(`league/${past.leagueKey}/teams`),
    yahooGet(`game/${game}/game_weeks`),
  ]);
  const adds = parseAdds(transactions);
  const budget = inferFaabBudget(parseWaiverStanding(teams), adds);
  const weeks = parseGameWeeks(calendar);
  const bids = adds.flatMap((a) => {
    const week = weekOn(weeks, a.at);
    return a.fromWaivers && a.bid != null && a.player && week ? [{ player: a.player, bid: a.bid, week }] : [];
  });
  if (!budget || bids.length === 0) return []; // not a FAAB league that season
  // The site keeps those seasons' losing bids. Without them the winning bids still say plenty.
  const contested = config.yahooCookie
    ? await yahooContestedClaims(past.leagueId, '', config.yahooCookie, {}, past.season).catch((e) => {
        console.error(`Could not load ${past.season} losing bids for Yahoo league ${current.leagueKey}:`, errorMessage(e));
        return null;
      })
    : null;
  const ranks = await ranksFor([...new Set(bids.map((b) => b.week))], (w) => fetchProjections(past.season, w), match.positionOf);
  return withLosingBids(bids, contested).flatMap((b) => {
    const id = b.player && match.idOf('yahoo', b.player);
    const rank = id ? ranks.get(b.week)?.get(id) : undefined;
    if (!b.player || !rank) return [];
    return [toPastClaim(b, `yahoo:${current.leagueKey}`, b.player, rank, Number(past.season), budget)];
  });
}

/** Every earlier season of your current Yahoo leagues, followed back through what each was renewed from. */
export async function loadPastYahooClaims(season: string, players: SleeperPlayerMap): Promise<PastClaim[]> {
  if (!(await yahooReady())) return [];
  const leagues = parseLeagues(await yahooGet('users;use_login=1/games;game_codes=nfl/leagues;out=settings'));
  const byKey = new Map(leagues.map((l) => [l.leagueKey, l]));
  const match = sleeperMatcher(players);
  const claims: PastClaim[] = [];
  for (const current of leagues.filter((l) => l.season === season)) {
    for (let past = byKey.get(current.previousKey ?? ''); past; past = byKey.get(past.previousKey ?? '')) {
      claims.push(...(await pastYahooSeason(past, current, match).catch((e) => {
        console.error(`Could not load ${past!.season} winning bids for Yahoo league ${current.leagueKey}:`, e);
        return [];
      })));
    }
  }
  return claims;
}

// Past seasons' claims: loaded in the background. They don't change, so a week apart,
// or a day if any season's losing bids couldn't be read.
let past: { season: string; at: number; keep: number; claims: PastClaim[] } | null = null;
let loadingPast: Promise<void> | null = null;

function pastClaimsSoFar(season: string, players: SleeperPlayerMap): PastClaim[] {
  const fresh = past?.season === season && Date.now() - past.at < past.keep;
  if (!fresh && !loadingPast) {
    loadingPast = loadPastYahooClaims(season, players)
      .then((claims) => void (past = { season, at: Date.now(), keep: claims.every((c) => c.rivals) ? 7 * DAY : DAY, claims }))
      .catch((e) => console.error('Could not load past seasons for FAAB prices:', e))
      .finally(() => (loadingPast = null));
  }
  return past?.season === season ? past.claims : [];
}

/** A league as the browser gets it: without what's only kept to price players and size bids. */
export const forBrowser = ({ winningBids: _, rivalBalances: __, lineup: ___, ...l }: WaiverLeagueWithBids): WaiverLeague => l;

/** The leagues with a likely price on each available player and a bid to make on him, in FAAB leagues. */
export async function withPrices(leagues: WaiverLeagueWithBids[], ctx: WaiverContext): Promise<WaiverLeague[]> {
  if (!leagues.some((l) => budgetOf(l))) return leagues.map(forBrowser);

  const players = await sleeperClient.players();
  const match = sleeperMatcher(players);
  const { claims: thisSeason, ranks } = await currentClaims(leagues, ctx, match);
  const claims = [...pastClaimsSoFar(ctx.season, players), ...thisSeason];
  const now = ranks.get(ctx.week);

  return leagues.map((l) => {
    const budget = budgetOf(l);
    if (!budget || !now) return forBrowser(l);
    const topRival = l.rivalBalances?.length ? Math.max(...l.rivalBalances) : null;
    const targetFor = (w: WaiverPlayer): Target | null => {
      const id = match.idOf(l.platform, w.player);
      const rank = id ? now.get(id) : undefined;
      return rank ? { league: leagueKey(l), position: pricePosition(w.player.position), rank, season: Number(ctx.season), week: ctx.week } : null;
    };
    const price = (w: WaiverPlayer): WaiverPlayer => {
      const target = targetFor(w);
      return { ...w, price: target && priceFor(claims, target, budget, topRival) };
    };
    const priced = new Map(l.available.map((w) => [playerKey(w.player), price(w)]));

    const weeksLeft = ctx.lastWeek - ctx.week + 1;
    const ties = tieChance(l.rules?.priority ?? null, l.rules?.teams ?? 0);
    const bidFor = (use: Use, money: number) => {
      const target = targetFor(use.add);
      const rivals = target && rivalBids(claims, target, budget, topRival);
      return rivals && money > 0 ? chooseBid(rivals, moveWorth(use, money, weeksLeft), money, ties) : null;
    };

    // Biggest gain first, each bid out of what the ones before it leave: bids in one run can all win.
    let left = l.rules?.faabLeft ?? 0;
    const moves = l.moves.map((m) => {
      const add = priced.get(playerKey(m.add.player)) ?? price(m.add);
      if (add.availability === 'free_agent') return { ...m, add }; // free to add: nothing to bid
      const bid = bidFor({ ...m, add }, left);
      left -= bid?.bid ?? 0;
      return { ...m, add, bid };
    });

    // Anyone else, on his own: you'd choose him instead of the moves, not as well as them.
    const moveBids = new Map(moves.map((m) => [playerKey(m.add.player), m.bid]));
    const available = [...priced.entries()].map(([key, w]) => {
      if (w.availability === 'free_agent') return w;
      if (moveBids.has(key)) return { ...w, bid: moveBids.get(key) };
      const use = l.lineup && bestUse(w, l.lineup, ctx.byeTeams, weeksLeft);
      return { ...w, bid: use && bidFor(use, l.rules?.faabLeft ?? 0) };
    });
    return forBrowser({ ...l, available, moves });
  });
}

/** For the backtest script: this season's claims and every past season's, loaded now. */
export async function allClaims(leagues: WaiverLeagueWithBids[], ctx: WaiverContext): Promise<PastClaim[]> {
  const players = await sleeperClient.players();
  const { claims } = await currentClaims(leagues, ctx, sleeperMatcher(players));
  return [...(await loadPastYahooClaims(ctx.season, players)), ...claims];
}
