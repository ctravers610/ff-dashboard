// Accounts and leagues added in the app, merged with the ones in .env.

import type { LeagueSource } from '@ffd/shared';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db as appDb, type Db } from '../db/client.js';
import { leagueSources } from '../db/schema.js';

export function sourceStore(db: Db) {
  return {
    async list(): Promise<LeagueSource[]> {
      const rows = await db.select().from(leagueSources).orderBy(leagueSources.createdAt);
      return rows.map((r) => ({ id: r.id, platform: r.platform as LeagueSource['platform'], value: r.value, label: r.label, fromEnv: false }));
    },
    async add(platform: LeagueSource['platform'], value: string, label: string | null): Promise<LeagueSource> {
      const [r] = await db.insert(leagueSources).values({ platform, value, label }).returning();
      return { id: r!.id, platform, value, label, fromEnv: false };
    },
    async remove(id: number): Promise<boolean> {
      return (await db.delete(leagueSources).where(eq(leagueSources.id, id)).returning({ id: leagueSources.id })).length > 0;
    },
  };
}

export type SourceStore = ReturnType<typeof sourceStore>;
export const sourceRepo = sourceStore(appDb);

// Sleeper usernames aren't case-sensitive, so "BoyntonBoy" and "boyntonboy" are one account.
export const sameValue = (platform: string, a: string, b: string) => (platform === 'sleeper' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Every source: .env's first, then the app's, without duplicates. */
export async function allSources(store: SourceStore = sourceRepo): Promise<LeagueSource[]> {
  const fromEnv: LeagueSource[] = [
    ...config.sleeperUsernames.map((value) => ({ id: null, platform: 'sleeper' as const, value, label: null, fromEnv: true })),
    ...config.espnLeagueIds.map((value) => ({ id: null, platform: 'espn' as const, value, label: null, fromEnv: true })),
  ];
  // The database being down mustn't hide the .env leagues.
  const added = await store.list().catch(() => []);
  return [...fromEnv, ...added.filter((a) => !fromEnv.some((e) => e.platform === a.platform && sameValue(a.platform, e.value, a.value)))];
}

/** What the dashboard and waivers fetch. */
export async function activeSources(store: SourceStore = sourceRepo) {
  const all = await allSources(store);
  return {
    sleeperUsernames: all.filter((s) => s.platform === 'sleeper').map((s) => s.value),
    espnLeagueIds: all.filter((s) => s.platform === 'espn').map((s) => s.value),
  };
}
