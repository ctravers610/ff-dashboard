// What each league's processed claims tell us: when its waivers actually run
// (neither Sleeper nor ESPN documents the time in its settings: ESPN's "process
// hour" doesn't match Eastern time, and Sleeper gives only a day), and, in FAAB
// leagues, what winning bids have cost.

import { inferWaiverRuns, type Player, type WaiverBids, type WaiverLeague, type WaiverRun } from '@ffd/shared';
import { toEspnPlayer } from '../adapters/espn/mapper.js';
import type { EspnLeague } from '../adapters/espn/types.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import { espnClient, type EspnAuth } from '../adapters/espn/client.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import type { SleeperLeague } from '../adapters/sleeper/types.js';

type Schedule = Pick<WaiverLeague, 'runs' | 'runsSource' | 'bids'>;

interface WinningBid {
  player: Player | null;
  bid: number;
  week: number;
}

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

export async function sleeperSchedule(league: SleeperLeague, week: number): Promise<Schedule> {
  const weeks = await Promise.all(weeksSoFar(week).map((w) => sleeperClient.transactions(league.league_id, w).catch(() => [])));
  const processed = weeks.flat().filter((t) => t.type === 'waiver' && t.status !== 'pending' && t.status_updated);
  const runs = inferWaiverRuns(processed.map((t) => new Date(t.status_updated)));
  // Winning bids, in FAAB leagues (waiver type 2).
  let bids: WaiverBids | null = null;
  if (league.settings?.waiver_type === 2) {
    const players = await sleeperClient.players();
    bids = summarizeBids(
      processed
        .filter((t) => t.status === 'complete')
        .map((t) => ({ player: toPlayer(Object.keys(t.adds ?? {})[0] ?? '', players), bid: t.settings?.waiver_bid ?? 0, week: t.leg ?? 0 })),
    );
  }
  if (runs.length > 0) return { runs, runsSource: 'history', bids };

  // No history yet: Sleeper's waiver day (2 is Wednesday, as history confirms
  // for real leagues), at the early-morning time Sleeper leagues process.
  const day = league.settings?.waiver_day_of_week;
  if (day == null) return { runs: [], runsSource: null, bids };
  const estimate: WaiverRun = { day: (day + 1) % 7, time: '03:00' };
  return { runs: [estimate], runsSource: 'settings', bids };
}

export async function espnSchedule(leagueId: string, season: string, week: number, auth: EspnAuth, league?: EspnLeague): Promise<Schedule> {
  const weeks = await Promise.all(weeksSoFar(week).map((w) => espnClient.transactions(leagueId, season, w, auth).catch(() => ({ transactions: [] }))));
  const processed = weeks.flatMap((w) => w.transactions ?? []).filter((t) => t.type === 'WAIVER' && t.processDate);
  const runs = inferWaiverRuns(processed.map((t) => new Date(t.processDate!)));

  // Winning bids in FAAB leagues, named from the players on the league's rosters now.
  let bids: WaiverBids | null = null;
  if (league?.settings?.acquisitionSettings?.isUsingAcquisitionBudget === true) {
    const known = new Map(
      (league.teams ?? []).flatMap((t) => (t.roster?.entries ?? []).flatMap((e) => (e.playerPoolEntry?.player ? [[e.playerPoolEntry.player.id, e.playerPoolEntry.player] as const] : []))),
    );
    bids = summarizeBids(
      processed
        .filter((t) => t.status === 'EXECUTED')
        .map((t) => {
          const id = t.items?.find((i) => i.type === 'ADD')?.playerId;
          const p = id != null ? known.get(id) : undefined;
          return { player: p ? toEspnPlayer(p) : null, bid: t.bidAmount ?? 0, week: t.scoringPeriodId ?? 0 };
        }),
    );
  }
  return runs.length > 0 ? { runs, runsSource: 'history', bids } : { runs: [], runsSource: null, bids };
}
