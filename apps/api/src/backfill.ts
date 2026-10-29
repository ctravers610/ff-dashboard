// Fills History with finished weeks: ones from before the dashboard started
// recording, and ones last captured before they ended. The dashboard only records
// while it's open (and the server sleeps when nobody is using it), so a week's
// row can be from before kickoff or Sunday night; whichever load comes next
// replaces it with the final score.

import type { LeagueSummary } from '@ffd/shared';
import { espnPastWeeks } from './adapters/espn/history.js';
import { sleeperPastWeeks } from './adapters/sleeper/history.js';
import { config } from './config.js';
import type { NewSnapshot } from './db/schema.js';
import { weekEndsAt } from './history.js';
import { snapshotRepo } from './snapshots.js';

// A week with no data (a bye, a league that started late) stays missing, so each
// league is checked at most once an hour rather than on every refresh.
const lastChecked = new Map<string, number>();
const CHECK_EVERY_MS = 60 * 60_000;

// Weeks before the current one without a final score: never captured, or
// captured before the week ended.
export const weeksToFetch = (season: string, current: number, captures: { week: number; capturedAt: Date }[]) =>
  Array.from({ length: Math.max(0, current - 1) }, (_, i) => i + 1).filter((week) => {
    const capture = captures.find((c) => c.week === week);
    return !capture || capture.capturedAt < weekEndsAt(season, week);
  });

export async function backfillHistory(leagues: LeagueSummary[], store = snapshotRepo, now = Date.now()): Promise<void> {
  for (const league of leagues) {
    if (league.platform !== 'sleeper' && league.platform !== 'espn') continue;
    const key = `${league.platform}:${league.leagueId}:${league.season}`;
    if (now - (lastChecked.get(key) ?? 0) < CHECK_EVERY_MS) continue;
    lastChecked.set(key, now);

    const weeks = weeksToFetch(league.season, league.week, await store.capturesFor(league.platform, league.leagueId, league.season));
    if (weeks.length === 0) continue;

    let rows: NewSnapshot[];
    try {
      rows =
        league.platform === 'sleeper'
          ? await sleeperPastWeeks(league, weeks)
          : await espnPastWeeks(league, weeks, config.espnAuth);
    } catch (e) {
      lastChecked.delete(key); // try again on a later load
      throw e;
    }
    await store.saveFinal(rows);
  }
}
