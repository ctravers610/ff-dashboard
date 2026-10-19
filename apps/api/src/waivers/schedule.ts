// When each league's waivers actually run, learned from its own processed
// claims: neither Sleeper nor ESPN documents the time in its settings (ESPN's
// "process hour" doesn't match Eastern time, and Sleeper gives only a day).

import { inferWaiverRuns, type WaiverLeague, type WaiverRun } from '@ffd/shared';
import { espnClient, type EspnAuth } from '../adapters/espn/client.js';
import { sleeperClient } from '../adapters/sleeper/client.js';
import type { SleeperLeague } from '../adapters/sleeper/types.js';

type Schedule = Pick<WaiverLeague, 'runs' | 'runsSource'>;
const weeksSoFar = (week: number) => Array.from({ length: Math.max(0, week) }, (_, i) => i + 1);

export async function sleeperSchedule(league: SleeperLeague, week: number): Promise<Schedule> {
  const weeks = await Promise.all(weeksSoFar(week).map((w) => sleeperClient.transactions(league.league_id, w).catch(() => [])));
  const processed = weeks.flat().filter((t) => t.type === 'waiver' && t.status !== 'pending' && t.status_updated);
  const runs = inferWaiverRuns(processed.map((t) => new Date(t.status_updated)));
  if (runs.length > 0) return { runs, runsSource: 'history' };

  // No history yet: Sleeper's waiver day (2 is Wednesday, as history confirms
  // for real leagues), at the early-morning time Sleeper leagues process.
  const day = league.settings?.waiver_day_of_week;
  if (day == null) return { runs: [], runsSource: null };
  const estimate: WaiverRun = { day: (day + 1) % 7, time: '03:00' };
  return { runs: [estimate], runsSource: 'settings' };
}

export async function espnSchedule(leagueId: string, season: string, week: number, auth: EspnAuth): Promise<Schedule> {
  const weeks = await Promise.all(weeksSoFar(week).map((w) => espnClient.transactions(leagueId, season, w, auth).catch(() => ({ transactions: [] }))));
  const processed = weeks.flatMap((w) => w.transactions ?? []).filter((t) => t.type === 'WAIVER' && t.processDate);
  const runs = inferWaiverRuns(processed.map((t) => new Date(t.processDate!)));
  return runs.length > 0 ? { runs, runsSource: 'history' } : { runs: [], runsSource: null };
}
