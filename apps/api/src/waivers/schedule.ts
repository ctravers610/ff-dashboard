// What each league's processed claims tell us: when its waivers actually run
// (neither Sleeper, ESPN nor Yahoo documents the time in its settings: ESPN's
// "process hour" doesn't match Eastern time, Sleeper gives only a day, and Yahoo
// only how long a dropped player waits), and, in FAAB leagues, what winning bids
// have cost.

import { inferWaiverRuns, type WaiverBids, type WaiverRun } from '@ffd/shared';
import { toEspnPlayer } from '../adapters/espn/mapper.js';
import type { EspnLeague } from '../adapters/espn/types.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { espnClient, type EspnAuth } from '../adapters/espn/client.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import type { SleeperLeague, SleeperPlayerMap, SleeperTransaction } from '../adapters/sleeper/types.js';
import type { YahooAdd } from '../adapters/yahoo/parse.js';
import { DAY } from '../cache.js';
import type { WaiverLeagueWithBids, WinningBid } from './context.js';

type Schedule = Pick<WaiverLeagueWithBids, 'runs' | 'runsSource' | 'bids' | 'winningBids'>;

/** Winning bids boiled down: how many, the median and the most, and the three biggest by name. */
export function summarizeBids(bids: WinningBid[]): WaiverBids | null {
  if (bids.length === 0) return null;
  const amounts = bids.map((b) => b.bid).sort((a, b) => a - b);
  const mid = Math.floor(amounts.length / 2);
  return {
    count: bids.length,
    median: amounts.length % 2 ? amounts[mid]! : (amounts[mid - 1]! + amounts[mid]!) / 2,
    high: amounts[amounts.length - 1]!,
    top: bids
      .filter((b) => b.player)
      .sort((a, b) => b.bid - a.bid)
      .slice(0, 3)
      .map((b) => ({ name: b.player!.name, position: b.player!.position, bid: b.bid, week: b.week })),
  };
}
const weeksSoFar = (week: number) => Array.from({ length: Math.max(0, week) }, (_, i) => i + 1);

/**
 * A Sleeper league's winning claims and the bids that lost to them. Failed claims
 * keep their bids: those outbid say so, and others (a full roster) never counted.
 */
export function sleeperClaims(processed: SleeperTransaction[], players: SleeperPlayerMap): WinningBid[] {
  const claimed = (t: SleeperTransaction) => Object.keys(t.adds ?? {})[0] ?? '';
  const outbid = processed.filter((t) => t.status === 'failed' && /claimed by another/i.test(t.metadata?.notes ?? ''));
  return processed
    .filter((t) => t.status === 'complete')
    .map((t) => ({
      player: toPlayer(claimed(t), players),
      bid: t.settings?.waiver_bid ?? 0,
      week: t.leg ?? 0,
      losers: outbid.filter((o) => o.leg === t.leg && claimed(o) === claimed(t)).map((o) => o.settings?.waiver_bid ?? 0),
    }));
}

export async function sleeperSchedule(league: SleeperLeague, week: number): Promise<Schedule> {
  const weeks = await Promise.all(weeksSoFar(week).map((w) => sleeperClient.transactions(league.league_id, w).catch(() => [])));
  const processed = weeks.flat().filter((t) => t.type === 'waiver' && t.status !== 'pending' && t.status_updated);
  const runs = inferWaiverRuns(processed.map((t) => new Date(t.status_updated)));
  // Winning bids, in FAAB leagues (waiver type 2).
  let claims: WinningBid[] = [];
  if (league.settings?.waiver_type === 2) {
    const players = await sleeperClient.players();
    claims = sleeperClaims(processed, players);
  }
  const bids = summarizeBids(claims);
  if (runs.length > 0) return { runs, runsSource: 'history', bids, winningBids: claims };

  // No history yet: Sleeper's waiver day (2 is Wednesday, as history confirms
  // for real leagues), at the early-morning time Sleeper leagues process.
  const day = league.settings?.waiver_day_of_week;
  if (day == null) return { runs: [], runsSource: null, bids, winningBids: claims };
  const estimate: WaiverRun = { day: (day + 1) % 7, time: '03:00' };
  return { runs: [estimate], runsSource: 'settings', bids, winningBids: claims };
}

/**
 * Yahoo's runs, from when its claims processed, and in FAAB leagues the winning
 * bids. A claim is credited to the week it plays in: the week it processed in,
 * counted back from this week a week at a time (runs fall between games).
 */
export function yahooSchedule(adds: YahooAdd[], faab: boolean, currentWeek: number, now = new Date()): Schedule {
  const processed = adds.filter((a) => a.fromWaivers);
  const runs = inferWaiverRuns(processed.map((a) => a.at));
  const weekOf = (at: Date) => Math.max(1, currentWeek - Math.floor((now.getTime() - at.getTime()) / (7 * DAY)));
  const claims = faab ? processed.map((a) => ({ player: a.player, bid: a.bid ?? 0, week: weekOf(a.at) })) : [];
  const bids = summarizeBids(claims);
  return runs.length > 0 ? { runs, runsSource: 'history', bids, winningBids: claims } : { runs: [], runsSource: null, bids, winningBids: claims };
}

export async function espnSchedule(leagueId: string, season: string, week: number, auth: EspnAuth, league?: EspnLeague): Promise<Schedule> {
  const weeks = await Promise.all(weeksSoFar(week).map((w) => espnClient.transactions(leagueId, season, w, auth).catch(() => ({ transactions: [] }))));
  const processed = weeks.flatMap((w) => w.transactions ?? []).filter((t) => t.type === 'WAIVER' && t.processDate);
  const runs = inferWaiverRuns(processed.map((t) => new Date(t.processDate!)));

  // Winning bids in FAAB leagues, named from the players on the league's rosters now.
  let claims: WinningBid[] = [];
  if (league?.settings?.acquisitionSettings?.isUsingAcquisitionBudget === true) {
    const known = new Map(
      (league.teams ?? []).flatMap((t) => (t.roster?.entries ?? []).flatMap((e) => (e.playerPoolEntry?.player ? [[e.playerPoolEntry.player.id, e.playerPoolEntry.player] as const] : []))),
    );
    claims = processed
      .filter((t) => t.status === 'EXECUTED')
      .map((t) => {
        const id = t.items?.find((i) => i.type === 'ADD')?.playerId;
        const p = id != null ? known.get(id) : undefined;
        return { player: p ? toEspnPlayer(p) : null, bid: t.bidAmount ?? 0, week: t.scoringPeriodId ?? 0 };
      });
  }
  const bids = summarizeBids(claims);
  return runs.length > 0 ? { runs, runsSource: 'history', bids, winningBids: claims } : { runs: [], runsSource: null, bids, winningBids: claims };
}
