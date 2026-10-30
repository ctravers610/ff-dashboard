// Runs the live feed: while games are on, take a snapshot every 30 seconds,
// compare it with the last one, and store the scoring changes as events.

import type { LeagueSummary, LiveEvent } from '@ffd/shared';
import { desc, eq, and } from 'drizzle-orm';
import { getDashboard } from '../dashboard.js';
import { db as appDb, type Db } from '../db/client.js';
import { liveEvents } from '../db/schema.js';
import { nflGames } from '../scoring/games.js';
import { fetchStats } from '../scoring/live.js';
import { diffSnapshots, type FeedEvent, type Snapshot } from './feed.js';
import { failingLeagues, platformPoints, trackedPlayers } from './track.js';

export function liveEventStore(db: Db) {
  return {
    async add(season: string, week: number, events: FeedEvent[]) {
      if (events.length) await db.insert(liveEvents).values(events.map((event) => ({ season, week, event })));
    },
    async recent(season: string, week: number, limit = 200): Promise<LiveEvent[]> {
      const rows = await db
        .select()
        .from(liveEvents)
        .where(and(eq(liveEvents.season, season), eq(liveEvents.week, week)))
        .orderBy(desc(liveEvents.id))
        .limit(limit);
      return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), week: r.week, ...(r.event as FeedEvent) }));
    },
  };
}
export const liveEventRepo = liveEventStore(appDb);

// The last snapshot, kept in memory: after a restart the first look only sets
// the starting point, so a restart never floods the feed with old scoring.
// `leagues` is this week's last good copy of each league, for when one fails to
// load. A failed league's points stay out of the snapshot, so the look where it
// comes back only sets its new starting point instead of reporting everything
// it missed at once.
let previous: { season: string; week: number; snapshot: Snapshot; leagues: LeagueSummary[] } | null = null;
let lastCheckedAt: Date | null = null;
export const lastLiveCheck = () => lastCheckedAt;

/** Games of this week under way right now. */
export async function gamesLive(season: string, week: number): Promise<boolean> {
  const games = await nflGames(season, week).catch(() => null);
  return games != null && [...games.values()].some((g) => g.started && g.progress < 1);
}

/** One look at the week: returns the new events (none on the first look of a week). */
export async function pollLive(store = liveEventRepo): Promise<FeedEvent[]> {
  const dashboard = await getDashboard();
  const { season, week } = dashboard;
  const last = previous?.season === season && previous.week === week ? previous : null;
  const failing = failingLeagues(dashboard, last?.leagues ?? []);
  const [tracked, stats, games] = await Promise.all([trackedPlayers(dashboard, failing), fetchStats(season, week), nflGames(season, week)]);
  const snapshot: Snapshot = { stats, games, platformPoints: platformPoints(dashboard) };
  lastCheckedAt = new Date();

  previous = { season, week, snapshot, leagues: [...dashboard.leagues, ...failing] };
  if (!last) return [];
  const events = diffSnapshots(last.snapshot, snapshot, tracked);
  await store.add(season, week, events);
  return events;
}

/** For tests: forget the last snapshot. */
export const resetLive = () => {
  previous = null;
  lastCheckedAt = null;
};
