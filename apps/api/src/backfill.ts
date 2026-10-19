// Fills History with weeks that finished before the dashboard started recording.

import type { LeagueSummary } from '@ffd/shared';
import { espnPastWeeks } from './adapters/espn/history.js';
import { sleeperPastWeeks } from './adapters/sleeper/history.js';
import { config } from './config.js';
import type { NewSnapshot } from './db/schema.js';
import { snapshotRepo } from './snapshots.js';

// Each league is tried once per server run, so a week with no data
// (a bye, a league that started late) isn't re-fetched on every refresh.
const attempted = new Set<string>();

export const missingWeeks = (current: number, have: number[]) =>
  Array.from({ length: Math.max(0, current - 1) }, (_, i) => i + 1).filter((w) => !have.includes(w));

export async function backfillHistory(leagues: LeagueSummary[], store = snapshotRepo): Promise<void> {
  for (const league of leagues) {
    if (league.platform !== 'sleeper' && league.platform !== 'espn') continue;
    const key = `${league.platform}:${league.leagueId}:${league.season}`;
    if (attempted.has(key)) continue;
    attempted.add(key);

    const missing = missingWeeks(league.week, await store.weeksFor(league.platform, league.leagueId, league.season));
    if (missing.length === 0) continue;

    let rows: NewSnapshot[];
    try {
      rows =
        league.platform === 'sleeper'
          ? await sleeperPastWeeks(league, missing)
          : await espnPastWeeks(league, missing, config.espnAuth);
    } catch (e) {
      attempted.delete(key); // try again on a later load
      throw e;
    }
    await store.saveIfMissing(rows);
  }
}
