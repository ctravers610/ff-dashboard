// What a player is likely to cost in FAAB, and what to bid on him. Every claim in
// your FAAB leagues (this season, and earlier seasons of the same leagues where
// the platform keeps them) says what each team that bid had to beat, as a share of
// that league's budget, or that it had no one to beat. Weighted toward the same
// position, a similarly ranked player, a similar point in the season and recent
// seasons, with the league's own claims counting double, those are a player's
// price and the odds of any bid winning. The bid to make is the one that pays off
// best against what he's worth to you. Pure functions; waivers/prices.ts gathers the claims and projections.

import { bidCounted, type ContestedClaim, type FaabBid, type FaabPrice, type WaiverMove, type WaiverPlayer } from '@ffd/shared';
import { normalizeName } from '../exposure.js';
import { scoreWithSettings } from '../scoring/projection.js';
import type { WinningBid } from './context.js';
import { canPlay } from '../lineupAdvice.js';
import { problem, UPGRADE_THRESHOLD, type Lineup } from './moves.js';

type Projections = Map<string, Record<string, number>>;

export interface PastClaim {
  league: string; // platform:leagueId of this season's league (earlier seasons' claims count as its own)
  position: string;
  rank: number; // his projected rank at his position the week he was claimed (1 = best)
  season: number;
  week: number;
  share: number; // the winning bid as a share of the league's budget
  rivals?: number[]; // the bids that lost to it, likewise, where they're known: empty when no one else bid
}

export type Target = Omit<PastClaim, 'share' | 'rivals'>;

// How far apart two claims can be and still say something about each other.
const RANK_SPREAD = 0.5; // in log rank: #20 and #33 are one spread apart
const WEEK_SPREAD = 4;
const SAME_LEAGUE = 2;
const PER_SEASON = 0.8; // each season back counts this much less: managers and habits change
const MIN_EVIDENCE = 4; // how many claims' worth of evidence it takes to give a price
const MOST_ALONE = 0.9; // however quiet similar claims were, someone else might want him

// One scoring for every league (half PPR), so players rank alike everywhere:
// the rank only has to say how good a player is, not what he scores in any one league.
const STANDARD: Record<string, number> = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 0.5, rec_yd: 0.1, rec_td: 6,
  pass_2pt: 2, rush_2pt: 2, rec_2pt: 2, fum_lost: -2,
  fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, xpm: 1,
  sack: 1, int: 2, fum_rec: 2, def_td: 6, safe: 2, blk_kick: 2, def_st_td: 6,
  pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4,
};

/** ESPN calls defenses D/ST; everyone else, DEF. */
export const pricePosition = (position: string) => (position === 'D/ST' ? 'DEF' : position);

/** A week's projected points per player in the standard scoring, by Sleeper id: all a rank needs, and far smaller to keep. */
export function standardPoints(projections: Projections): Map<string, number> {
  return new Map([...projections].map(([id, stats]) => [id, scoreWithSettings(stats, STANDARD)]));
}

/**
 * Each player's rank at his position by projected points over these weeks (a
 * week and the few after it, so one bye or one matchup doesn't decide it), by
 * Sleeper id. Players projected for nothing aren't ranked.
 */
export function projectedRanks(weeks: Map<string, number>[], positionOf: (sleeperId: string) => string | null): Map<string, number> {
  const total = new Map<string, number>();
  for (const w of weeks) for (const [id, points] of w) total.set(id, (total.get(id) ?? 0) + points);
  const byPosition = new Map<string, [string, number][]>();
  for (const [id, points] of total) {
    const position = positionOf(id);
    if (!position || points <= 0) continue;
    byPosition.set(position, [...(byPosition.get(position) ?? []), [id, points]]);
  }
  const ranks = new Map<string, number>();
  for (const list of byPosition.values()) list.sort((a, b) => b[1] - a[1]).forEach(([id], i) => ranks.set(id, i + 1));
  return ranks;
}

/** How much one past claim says about a target: 0 at another position. */
export function weightOf(c: PastClaim, t: Target): number {
  if (pricePosition(c.position) !== pricePosition(t.position)) return 0;
  const rank = (Math.log(c.rank) - Math.log(t.rank)) / RANK_SPREAD;
  const week = (c.week - t.week) / WEEK_SPREAD;
  const seasons = Math.max(0, t.season - c.season);
  return Math.exp(-0.5 * (rank * rank + week * week)) * (c.league === t.league ? SAME_LEAGUE : 1) * PER_SEASON ** seasons;
}

function weightedQuantile(points: { value: number; weight: number }[], q: number): number {
  const sorted = [...points].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((n, p) => n + p.weight, 0);
  let seen = 0;
  for (const p of sorted) {
    seen += p.weight;
    if (seen >= q * total) return p.value;
  }
  return sorted[sorted.length - 1]!.value;
}

/**
 * What each team that bid on a past claim had to beat: that's what you'd face if
 * you were the one who wanted him. The winner had to beat the next bid, each loser
 * the winner's, and null is a bid with no one else to beat. Where the losing bids
 * aren't known, all we can say is what a rival paid.
 */
export function bidsFaced(c: PastClaim): (number | null)[] {
  if (!c.rivals) return [c.share];
  if (c.rivals.length === 0) return [null];
  return [Math.max(...c.rivals), ...c.rivals.map(() => c.share)];
}

/** The bid to beat if someone else wants him, as shares of the budget, or null when too few similar claims. */
export function estimateShare(claims: PastClaim[], t: Target): { low: number; typical: number; high: number; basedOn: number } | null {
  const similar = claims.map((c) => ({ c, weight: weightOf(c, t) })).filter((p) => p.weight > 0.01);
  const total = similar.reduce((n, p) => n + p.weight, 0);
  // The effective number of claims: a few close matches count as much as many far ones.
  const evidence = total ** 2 / similar.reduce((n, p) => n + p.weight ** 2, 0);
  const points = similar.flatMap(({ c, weight }) => bidsFaced(c).flatMap((value) => (value == null ? [] : [{ value, weight }])));
  if (!points.length || evidence < MIN_EVIDENCE) return null;
  return { low: weightedQuantile(points, 0.25), typical: weightedQuantile(points, 0.5), high: weightedQuantile(points, 0.75), basedOn: Math.round(evidence) };
}

/**
 * The estimate in a league's dollars: half the bids to beat for players like him
 * land between low and high. No one can bid more than `topRival`, the most any
 * other team has left, when it's known.
 */
export function priceFor(claims: PastClaim[], t: Target, budget: number, topRival: number | null = null): FaabPrice | null {
  const s = estimateShare(claims, t);
  if (!s) return null;
  const dollars = (share: number) => Math.min(Math.round(share * budget), topRival ?? Infinity);
  return { low: dollars(s.low), typical: dollars(s.typical), high: dollars(s.high), basedOn: s.basedOn };
}

/**
 * Adds the losing bids to a league's claims, from Yahoo's site: each contested
 * claim by player and winning bid, and any claim it doesn't list had no other bid.
 * Bids that never counted (an invalid claim) aren't bids to beat. Without the
 * site, claims stay as they are.
 */
export function withLosingBids(claims: WinningBid[], contested: ContestedClaim[] | null | undefined): WinningBid[] {
  if (!contested) return claims;
  const key = (name: string, bid: number) => `${normalizeName(name)}:${bid}`;
  const losing = new Map(contested.map((c) => [key(c.player, c.winner.amount), c.losers.filter(bidCounted).map((b) => b.amount)]));
  return claims.map((c) => (c.player ? { ...c, losers: losing.get(key(c.player.name, c.bid)) ?? [] } : c));
}

/**
 * How often someone who wants a player like this one has no one to bid against:
 * of the bids on similar claims, those with no other bid. Zero where no similar
 * claim's losing bids are known.
 */
export function noRivalChance(claims: PastClaim[], t: Target): number {
  const similar = claims.filter((c) => c.rivals).map((c) => ({ rivals: c.rivals!, weight: weightOf(c, t) })).filter((p) => p.weight > 0.01);
  const bids = similar.reduce((n, { rivals, weight }) => n + weight * (rivals.length + 1), 0);
  const alone = similar.reduce((n, { rivals, weight }) => n + (rivals.length === 0 ? weight : 0), 0);
  return bids > 0 ? Math.min(MOST_ALONE, alone / bids) : 0;
}

/** The bids you might have to beat for a player, in dollars (-1: no one else bids), each with its weight. */
export type RivalBids = { amount: number; weight: number }[];

/**
 * What you'd have to beat for a player like this one, or null when too few similar
 * claims: how often no one else bids, and otherwise the bids faced on similar
 * claims. No one can bid more than `topRival`, and a bidding war can always come
 * from nowhere: one made-up claim at the most anyone can pay keeps a bid from
 * looking certain until no other team can top it.
 */
export function rivalBids(claims: PastClaim[], t: Target, budget: number, topRival: number | null = null): RivalBids | null {
  if (!estimateShare(claims, t)) return null;
  const most = topRival ?? budget;
  const seen = claims.map((c) => ({ c, weight: weightOf(c, t) })).filter((p) => p.weight > 0.01);
  const faced = seen.flatMap(({ c, weight }) => bidsFaced(c).flatMap((share) => (share == null ? [] : [{ amount: Math.min(Math.round(share * budget), most), weight }])));
  if (faced.length === 0) return null;
  const bids = [...faced, { amount: most, weight: faced.reduce((n, b) => n + b.weight, 0) / faced.length }];
  const alone = noRivalChance(claims, t);
  const total = bids.reduce((n, b) => n + b.weight, 0);
  return [...bids, { amount: -1, weight: (total * alone) / (1 - alone) }];
}

/**
 * How often you win a tie, from your place in the claim order: at first in line
 * you beat everyone, at last no one.
 */
export const tieChance = (priority: number | null, teams: number) => (priority == null || teams < 2 ? 0 : (teams - priority) / (teams - 1));

/** The chance a bid wins: it beats the rival bid, or ties it and has the better claim priority. */
export function chanceAt(rivals: RivalBids, bid: number, ties: number): number {
  const total = rivals.reduce((n, r) => n + r.weight, 0);
  const won = rivals.reduce((n, r) => n + (r.amount < bid ? r.weight : r.amount === bid ? r.weight * ties : 0), 0);
  return total > 0 ? won / total : 0;
}

/** A player and what he'd do for your lineup. */
export type Use = Pick<WaiverMove, 'gain' | 'add' | 'replaces'>;

/**
 * What a move is worth to you in dollars. Your FAAB's job is to buy points for
 * the rest of the season, so a point costs what you have left over the points
 * it could still buy: an upgrade of the smallest size worth a claim, made each
 * week from now on and lasting to the end of the season. Money is worth nothing
 * after the last week, so a point gets dearer as weeks run out, and you spend
 * more freely. A move's points are its gain this week or, if he's better than who
 * he replaces for good, that gain over the rest of the season.
 */
export function moveWorth(move: Use, faabLeft: number, weeksLeft: number): number {
  const weeks = Math.max(1, weeksLeft);
  const buyable = (UPGRADE_THRESHOLD * weeks * (weeks + 1)) / 2;
  return Math.min(faabLeft, Math.round((usePoints(move, weeks) / buyable) * faabLeft));
}

function usePoints({ gain, add, replaces }: Use, weeks: number): number {
  const lasting = replaces ? (add.restOfSeason ?? 0) - (replaces.restOfSeason ?? 0) : gain * weeks;
  return Math.max(0, gain, lasting);
}

/**
 * The most an available player could do for your lineup, as if he were a move:
 * in each slot he can play, what he adds over the best you can already field this
 * week, measured for the rest of the season against the better of the starter and
 * your best bench player there. Null if he can't play any of your slots.
 */
export function bestUse(add: WaiverPlayer, { starters, bench }: Lineup, byeTeams: Set<string> | null, weeksLeft: number): Use | null {
  const week = (p: WaiverPlayer | null | undefined) => p?.week ?? 0;
  const season = (p: WaiverPlayer | null | undefined) => p?.restOfSeason ?? 0;
  const uses = starters
    .filter((s) => canPlay(s.slot, add.player.position))
    .map(({ slot, player }): Use => {
      const backups = bench.filter((b) => canPlay(slot, b.player.position));
      const healthy = backups.filter((b) => problem(b.player, byeTeams) == null);
      const fielded = Math.max(player && problem(player.player, byeTeams) == null ? week(player) : 0, ...healthy.map(week));
      const replaces = [player, ...backups].reduce<WaiverPlayer | null>((best, p) => (p && (!best || season(p) > season(best)) ? p : best), null);
      return { gain: week(add) - fielded, add, replaces };
    });
  return uses.reduce<Use | null>((best, u) => (!best || usePoints(u, weeksLeft) > usePoints(best, weeksLeft) ? u : best), null);
}

const ODDS = [0.5, 0.75, 0.9]; // the chances worth showing a bid for

/**
 * The bid to make: the one with the best payoff, the chance it wins times what
 * you'd keep of his worth after paying it. Bidding more wins more often but
 * leaves less, so the best bid sits below his worth, and lower still when the
 * odds barely improve for paying more. It never tops the highest bid anyone can
 * make by more than a dollar, or what you have left.
 */
export function chooseBid(rivals: RivalBids, worth: number, faabLeft: number, ties: number): FaabBid {
  const most = Math.max(0, ...rivals.map((r) => r.amount)) + 1; // nothing beats more than topping every bid
  const can = Math.min(most, faabLeft);
  const bids = Array.from({ length: Math.floor(can) + 1 }, (_, bid) => ({ bid, chance: chanceAt(rivals, bid, ties) }));
  const best = bids.reduce((a, b) => (b.chance * (worth - b.bid) > a.chance * (worth - a.bid) ? b : a), bids[0]!);
  const levels = ODDS.flatMap((level) => bids.find((b) => b.chance >= level) ?? []);
  const odds = [...new Map([...levels, best].sort((a, b) => a.bid - b.bid).map((b) => [b.bid, b])).values()];
  return { bid: best.bid, chance: best.chance, worth, odds };
}

export interface Backtest {
  claims: number; // past claims tried
  priced: number; // bids faced on those with enough earlier claims to price
  inRange: number; // share of those whose real bid fell between low and high (aim: about half)
  medianMiss: number; // median gap between the typical estimate and the real bid, as a share of budget
}

/** Whether one claim was already known when another was made: an earlier season, or an earlier week. */
export const knownBefore = (o: PastClaim, c: PastClaim) => o.season < c.season || (o.season === c.season && o.week < c.week);

/** Prices each past claim from what was known before it, as it would have been priced then. */
export function backtest(claims: PastClaim[], estimate = estimateShare): Backtest {
  const misses: number[] = [];
  let inRange = 0;
  for (const c of claims) {
    const s = estimate(claims.filter((o) => knownBefore(o, c)), c);
    if (!s) continue;
    for (const real of bidsFaced(c)) {
      if (real == null) continue;
      misses.push(Math.abs(s.typical - real));
      if (real >= s.low && real <= s.high) inRange++;
    }
  }
  const sorted = misses.sort((a, b) => a - b);
  return {
    claims: claims.length,
    priced: misses.length,
    inRange: misses.length ? inRange / misses.length : 0,
    medianMiss: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0,
  };
}

/**
 * Whether the odds can be trusted: for each bid on a past claim, the cheapest bid
 * that looked like it had each chance of winning, from what was known before it,
 * and whether that bid would really have won. Bids meant to win 75% of the time
 * should win about 75% of the time. In a nominal $100 budget, losing ties.
 */
export function calibrate(claims: PastClaim[], tested: (c: PastClaim) => boolean = () => true, levels = ODDS): { level: number; tried: number; won: number }[] {
  const results = levels.map((level) => ({ level, tried: 0, won: 0 }));
  for (const c of claims.filter(tested)) {
    const rivals = rivalBids(claims.filter((o) => knownBefore(o, c)), c, 100);
    if (!rivals) continue;
    for (const r of results) {
      const bid = Array.from({ length: 102 }, (_, b) => b).find((b) => chanceAt(rivals, b, 0) >= r.level);
      if (bid == null) continue;
      for (const faced of bidsFaced(c)) {
        r.tried++;
        if (faced == null || Math.round(faced * 100) < bid) r.won++;
      }
    }
  }
  return results;
}
