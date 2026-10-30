// Hand-entered leagues (FFPC), stored in Postgres.

import type { ManualLeague, ManualLeagueInput, ManualMatchup } from '@ffd/shared';
import { and, eq, sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { db as appDb, type Db } from '../../db/client.js';
import { leagueSnapshots, manualLeagues, manualMatchupWeeks, type ManualLeagueRow } from '../../db/schema.js';

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

// The NFL season a matchup was pasted in: the year, except that January's last
// weeks (and anything before August) belong to the season that started the year
// before. The migration that created manual_matchup_weeks uses the same rule.
export function matchupSeason(matchup: ManualMatchup): string {
  const at = new Date(matchup.capturedAt);
  return String(at.getUTCFullYear() - (at.getUTCMonth() < 7 ? 1 : 0));
}

// Keeps a copy of each week's paste. A newer paste of the week replaces an older
// one; re-saving the league with the same paste (a roster edit) changes nothing.
async function archiveMatchup(db: Pick<Db, 'insert'>, leagueId: string, matchup: ManualMatchup | null | undefined): Promise<void> {
  if (!matchup) return;
  await db
    .insert(manualMatchupWeeks)
    .values({ leagueId, season: matchupSeason(matchup), week: matchup.week, matchup, capturedAt: new Date(matchup.capturedAt) })
    .onConflictDoUpdate({
      target: [manualMatchupWeeks.leagueId, manualMatchupWeeks.season, manualMatchupWeeks.week],
      set: { matchup: sql`excluded.matchup`, capturedAt: sql`excluded.captured_at` },
      setWhere: sql`excluded.captured_at > ${manualMatchupWeeks.capturedAt}`,
    });
}

// A store bound to a database, so tests can point it at a throwaway one.
export function manualLeagueStore(db: Db) {
  return {
    async list(): Promise<ManualLeague[]> {
      const rows = await db.select().from(manualLeagues).orderBy(manualLeagues.createdAt);
      return rows.map(toLeague);
    },

    async create(input: ManualLeagueInput): Promise<ManualLeague> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(manualLeagues)
          .values({ name: input.name, teamName: input.teamName, rosterText: input.rosterText, matchup: input.matchup ?? null })
          .returning();
        await archiveMatchup(tx, row!.id, input.matchup);
        return toLeague(row!);
      });
    },

    async update(id: string, input: ManualLeagueInput): Promise<ManualLeague | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(manualLeagues)
          .set({
            name: input.name,
            teamName: input.teamName,
            rosterText: input.rosterText,
            matchup: input.matchup ?? null,
            // The database's clock, like the defaultNow() that set it on create. The
            // app's clock can differ from it by a few ms or more (another machine, or a
            // Docker VM's drifting clock), which could make updatedAt go backwards.
            updatedAt: sql`now()`,
          })
          .where(eq(manualLeagues.id, id))
          .returning();
        if (!row) return null;
        await archiveMatchup(tx, id, input.matchup);
        return toLeague(row);
      });
    },

    // Each week's latest paste for a league's season, oldest week first.
    async matchupWeeks(leagueId: string, season: string): Promise<ManualMatchup[]> {
      const rows = await db
        .select({ matchup: manualMatchupWeeks.matchup })
        .from(manualMatchupWeeks)
        .where(and(eq(manualMatchupWeeks.leagueId, leagueId), eq(manualMatchupWeeks.season, season)))
        .orderBy(manualMatchupWeeks.week);
      return rows.map((r) => r.matchup);
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
