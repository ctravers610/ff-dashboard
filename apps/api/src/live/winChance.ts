// Win chance over the week, for the line on each team's card: one point per
// league about once a minute while games are on, so the line skips the days
// nothing happens and reads roughly in game time.

import { winProbability, type DashboardResponse, type WinChancePoint } from '@ffd/shared';
import { and, asc, eq } from 'drizzle-orm';
import { db as appDb, type Db } from '../db/client.js';
import { winChances } from '../db/schema.js';

export interface WinChanceRow {
  leagueKey: string;
  at: Date;
  chance: number;
}

export function winChanceStore(db: Db) {
  return {
    async add(season: string, week: number, rows: WinChanceRow[]) {
      if (rows.length) await db.insert(winChances).values(rows.map((r) => ({ season, week, ...r }))).onConflictDoNothing();
    },
    async series(season: string, week: number): Promise<Map<string, WinChancePoint[]>> {
      const rows = await db
        .select()
        .from(winChances)
        .where(and(eq(winChances.season, season), eq(winChances.week, week)))
        .orderBy(asc(winChances.at));
      const out = new Map<string, WinChancePoint[]>();
      for (const r of rows) {
        const points = out.get(r.leagueKey) ?? [];
        out.set(r.leagueKey, points);
        points.push({ at: r.at.toISOString(), chance: Math.round(r.chance * 1000) / 1000 });
      }
      return out;
    },
  };
}
export const winChanceRepo = winChanceStore(appDb);

const MIN_GAP_MS = 60_000;
let lastRecorded = 0;

/** This look's points: every matchup of this week with a chance to judge. */
export function chanceRows(dashboard: DashboardResponse, at: Date): WinChanceRow[] {
  return dashboard.leagues.flatMap((l) => {
    const chance = l.matchup?.week === dashboard.week ? winProbability(l.matchup) : null;
    return chance == null ? [] : [{ leagueKey: `${l.platform}:${l.leagueId}`, at, chance }];
  });
}

/** Records this look unless one was recorded in the last minute (a "Check now" shouldn't add a point). */
export async function recordWinChances(dashboard: DashboardResponse, store = winChanceRepo, now = new Date()) {
  if (now.getTime() - lastRecorded < MIN_GAP_MS) return;
  lastRecorded = now.getTime();
  await store.add(dashboard.season, dashboard.week, chanceRows(dashboard, now));
}

/** For tests: forget when the last point was recorded. */
export const resetWinChances = () => {
  lastRecorded = 0;
};

const MAX_POINTS = 150; // far more than a card's line can show

/** Evenly spaced points from the series, always keeping the first and last. */
export function thin<T>(points: T[], max = MAX_POINTS): T[] {
  if (points.length <= max) return points;
  return Array.from({ length: max }, (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))]!);
}
