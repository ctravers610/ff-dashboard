// Saves Sleeper's trending adds once a day, to test later whether they predict
// FAAB bidding wars. Sleeper only reports the current count, so this is the only
// way to have a history. Nothing reads these rows yet: bids and odds don't use them.

import { easternParts } from '@ffd/shared';
import { eq } from 'drizzle-orm';
import { sleeperClient } from '../adapters/sleeper/client.js';
import { toPlayer } from '../adapters/sleeper/mapper.js';
import type { SleeperPlayerMap } from '../adapters/sleeper/types.js';
import { config } from '../config.js';
import { db as appDb, type Db } from '../db/client.js';
import { trendingAddSnapshots, type NewTrendingAddSnapshot } from '../db/schema.js';
import { playerKey } from '../exposure.js';
import { nflGames } from '../scoring/games.js';
import { claimWeek, LAST_REGULAR_WEEK } from './moves.js';

// A day starts at 9 PM Eastern, not midnight: overnight waivers run hours later,
// and reminders go out at the same time. It's the first check after that which
// saves the day. On the free plan the app may be asleep then, so a later check
// (the next morning, say) still fills it in, and captured_at says when that was.
const DAY_STARTS_AT_HOUR = 21;

/** Which day a snapshot taken now belongs to, as YYYY-MM-DD: the Eastern date its 24 hours began. */
export function trendingDay(now: Date): string {
  const { year, month, day, hour } = easternParts(now);
  const date = new Date(Date.UTC(year, month - 1, hour >= DAY_STARTS_AT_HOUR ? day : day - 1));
  return date.toISOString().slice(0, 10);
}

/**
 * Sleeper's list as rows, by the same playerKey the waiver page uses. Ids missing
 * from Sleeper's player list are left out, since they could never match a claim.
 * If two ids share a key, the larger count stands: a key can only have one row.
 */
export function toTrendingRows(
  trending: { player_id: string; count: number }[],
  players: SleeperPlayerMap,
  at: { day: string; season: string; week: number },
): NewTrendingAddSnapshot[] {
  const byKey = new Map<string, NewTrendingAddSnapshot>();
  for (const { player_id, count } of trending) {
    const player = toPlayer(player_id, players);
    if (!player?.position) continue;
    const key = playerKey(player);
    if (count > (byKey.get(key)?.adds ?? -1)) byKey.set(key, { ...at, playerKey: key, position: player.position, adds: count });
  }
  return [...byKey.values()];
}

export function trendingStore(db: Db) {
  return {
    async hasDay(day: string): Promise<boolean> {
      const rows = await db.select({ day: trendingAddSnapshots.day }).from(trendingAddSnapshots).where(eq(trendingAddSnapshots.day, day)).limit(1);
      return rows.length > 0;
    },

    // The first capture of a day stands: a re-run never changes what was saved.
    async save(rows: NewTrendingAddSnapshot[]): Promise<void> {
      if (rows.length > 0) await db.insert(trendingAddSnapshots).values(rows).onConflictDoNothing();
    },
  };
}

export const trendingRepo = trendingStore(appDb);

/** Saves this day's snapshot unless it's already saved, and says how many players it saved. The demo never writes. */
export async function recordTrendingAdds(store = trendingRepo, now = new Date(), demo = Boolean(config.demo)): Promise<number> {
  if (demo) return 0;
  const day = trendingDay(now);
  if (await store.hasDay(day)) return 0;

  const [state, trending, players] = await Promise.all([sleeperClient.state(), sleeperClient.trending('add'), sleeperClient.players()]);
  const thisWeek = await nflGames(state.season, state.week).catch(() => null);
  const week = Math.min(claimWeek(state.week, thisWeek), LAST_REGULAR_WEEK);
  const rows = toTrendingRows(trending, players, { day, season: state.season, week });
  await store.save(rows);
  return rows.length;
}
