// Weekly league snapshots: each dashboard load records where every league
// stands, so the History tab can show how the season has gone.

import type { LeagueSummary } from '@ffd/shared';
import { and, eq, sql } from 'drizzle-orm';
import { db as appDb, type Db } from './db/client.js';
import { leagueSnapshots, type NewSnapshot, type SnapshotRow } from './db/schema.js';

// Turns a league's current state into a snapshot row, or null when there's no
// matchup to record (bye week, manual league without a pasted page).
export function toSnapshot(league: LeagueSummary): NewSnapshot | null {
  const m = league.matchup;
  if (!m) return null;
  const me = league.standings.find((t) => t.teamId === league.myTeamId);
  return {
    platform: league.platform,
    leagueId: league.leagueId,
    leagueName: league.name,
    season: league.season,
    week: m.week,
    points: m.me.points,
    projected: m.me.projected ?? null,
    opponentName: m.opponent?.teamName ?? null,
    opponentPoints: m.opponent?.points ?? null,
    opponentProjected: m.opponent?.projected ?? null,
    allPlayRank: m.allPlay?.myRank ?? null,
    allPlayTeams: m.allPlay?.teams.length ?? null,
    allPlayWinSlots: m.allPlay?.winSlots ?? null,
    wins: me?.wins ?? null,
    losses: me?.losses ?? null,
    ties: me?.ties ?? null,
    standingRank: me?.rank ?? null,
    standingTeams: league.standings.length || null,
  };
}

export function snapshotStore(db: Db) {
  return {
    // One row per league per week: later captures overwrite earlier ones, so the
    // row ends the week holding the last values we saw.
    async save(rows: NewSnapshot[]): Promise<void> {
      if (rows.length === 0) return;
      await db
        .insert(leagueSnapshots)
        .values(rows)
        .onConflictDoUpdate({
          target: [leagueSnapshots.platform, leagueSnapshots.leagueId, leagueSnapshots.season, leagueSnapshots.week],
          // `excluded` is Postgres' name for the row we tried to insert.
          set: {
            leagueName: sql`excluded.league_name`,
            points: sql`excluded.points`,
            projected: sql`excluded.projected`,
            opponentName: sql`excluded.opponent_name`,
            opponentPoints: sql`excluded.opponent_points`,
            opponentProjected: sql`excluded.opponent_projected`,
            allPlayRank: sql`excluded.all_play_rank`,
            allPlayTeams: sql`excluded.all_play_teams`,
            allPlayWinSlots: sql`excluded.all_play_win_slots`,
            wins: sql`excluded.wins`,
            losses: sql`excluded.losses`,
            ties: sql`excluded.ties`,
            standingRank: sql`excluded.standing_rank`,
            standingTeams: sql`excluded.standing_teams`,
            capturedAt: sql`now()`,
          },
        });
    },

    // Backfill never overwrites: a live snapshot already in the table is more
    // complete than anything reconstructed after the fact.
    async saveIfMissing(rows: NewSnapshot[]): Promise<void> {
      if (rows.length === 0) return;
      await db.insert(leagueSnapshots).values(rows).onConflictDoNothing();
    },

    async weeksFor(platform: string, leagueId: string, season: string): Promise<number[]> {
      const rows = await db
        .select({ week: leagueSnapshots.week })
        .from(leagueSnapshots)
        .where(
          and(
            eq(leagueSnapshots.platform, platform),
            eq(leagueSnapshots.leagueId, leagueId),
            eq(leagueSnapshots.season, season),
          ),
        );
      return rows.map((r) => r.week);
    },

    listForSeason(season: string): Promise<SnapshotRow[]> {
      return db
        .select()
        .from(leagueSnapshots)
        .where(eq(leagueSnapshots.season, season))
        .orderBy(leagueSnapshots.leagueName, leagueSnapshots.week);
    },
  };
}

export const snapshotRepo = snapshotStore(appDb);

// Dashboard loads happen every minute while the page is open; writing that
// often adds nothing, so each league is saved at most once every few minutes.
const lastSaved = new Map<string, number>();
const SAVE_EVERY_MS = 5 * 60_000;

export function recordSnapshots(leagues: LeagueSummary[], store = snapshotRepo, now = Date.now()): Promise<void> {
  const due: NewSnapshot[] = [];
  for (const league of leagues) {
    const snapshot = toSnapshot(league);
    if (!snapshot) continue;
    const key = `${snapshot.platform}:${snapshot.leagueId}:${snapshot.season}:${snapshot.week}`;
    if (now - (lastSaved.get(key) ?? 0) < SAVE_EVERY_MS) continue;
    lastSaved.set(key, now);
    due.push(snapshot);
  }
  return store.save(due).catch((e) => {
    for (const s of due) lastSaved.delete(`${s.platform}:${s.leagueId}:${s.season}:${s.week}`); // retry next load
    throw e;
  });
}
