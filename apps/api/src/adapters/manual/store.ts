// Hand-entered leagues (FFPC), stored in Postgres.

import type { ManualLeague, ManualLeagueInput } from '@ffd/shared';
import { and, eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { db as appDb, type Db } from '../../db/client.js';
import { leagueSnapshots, manualLeagues, type ManualLeagueRow } from '../../db/schema.js';

const toLeague = (row: ManualLeagueRow): ManualLeague => ({
  id: row.id,
  platform: 'ffpc',
  name: row.name,
  teamName: row.teamName,
  rosterText: row.rosterText,
  matchup: row.matchup ?? null,
  updatedAt: row.updatedAt.toISOString(),
  waiversCapturedAt: row.waiversCapturedAt?.toISOString() ?? null,
});

// A store bound to a database, so tests can point it at a throwaway one.
export function manualLeagueStore(db: Db) {
  return {
    async list(): Promise<ManualLeague[]> {
      const rows = await db.select().from(manualLeagues).orderBy(manualLeagues.createdAt);
      return rows.map(toLeague);
    },

    async create(input: ManualLeagueInput): Promise<ManualLeague> {
      const [row] = await db
        .insert(manualLeagues)
        .values({ name: input.name, teamName: input.teamName, rosterText: input.rosterText, matchup: input.matchup ?? null })
        .returning();
      return toLeague(row!);
    },

    async update(id: string, input: ManualLeagueInput): Promise<ManualLeague | null> {
      const [row] = await db
        .update(manualLeagues)
        .set({
          name: input.name,
          teamName: input.teamName,
          rosterText: input.rosterText,
          matchup: input.matchup ?? null,
          updatedAt: new Date(),
        })
        .where(eq(manualLeagues.id, id))
        .returning();
      return row ? toLeague(row) : null;
    },

    // The add/drop page for the Waivers tab. Kept apart from update(), so editing
    // the roster never wipes a waiver paste, or the other way round.
    async setWaivers(id: string, text: string): Promise<ManualLeague | null> {
      const [row] = await db
        .update(manualLeagues)
        .set({ waiversText: text, waiversCapturedAt: new Date() })
        .where(eq(manualLeagues.id, id))
        .returning();
      return row ? toLeague(row) : null;
    },

    async waiverPastes(): Promise<{ id: string; text: string; capturedAt: Date }[]> {
      const rows = await db.select().from(manualLeagues).orderBy(manualLeagues.createdAt);
      return rows.flatMap((r) => (r.waiversText && r.waiversCapturedAt ? [{ id: r.id, text: r.waiversText, capturedAt: r.waiversCapturedAt }] : []));
    },

    // A deleted league takes its history with it, in one transaction so you
    // never end up with snapshots for a league that no longer exists.
    async remove(id: string): Promise<boolean> {
      return db.transaction(async (tx) => {
        const rows = await tx.delete(manualLeagues).where(eq(manualLeagues.id, id)).returning({ id: manualLeagues.id });
        if (rows.length === 0) return false;
        await tx
          .delete(leagueSnapshots)
          .where(and(eq(leagueSnapshots.platform, 'ffpc'), eq(leagueSnapshots.leagueId, id)));
        return true;
      });
    },

    // Before the database existed, leagues lived in apps/api/data/manual-leagues.json.
    // Copy them over once (keeping their ids), then set the file aside.
    async importLegacyJson(file = path.join(config.dataDir, 'manual-leagues.json')): Promise<number> {
      let legacy: ManualLeague[];
      try {
        legacy = JSON.parse(await fs.readFile(file, 'utf8')) as ManualLeague[];
      } catch {
        return 0; // no legacy file
      }
      if (legacy.length > 0) {
        await db
          .insert(manualLeagues)
          .values(
            legacy.map((l) => ({
              id: l.id,
              platform: l.platform,
              name: l.name,
              teamName: l.teamName,
              rosterText: l.rosterText,
              matchup: l.matchup ?? null,
              updatedAt: new Date(l.updatedAt),
            })),
          )
          .onConflictDoNothing();
      }
      await fs.rename(file, `${file}.imported`);
      return legacy.length;
    },
  };
}

export const manualLeagueRepo = manualLeagueStore(appDb);
