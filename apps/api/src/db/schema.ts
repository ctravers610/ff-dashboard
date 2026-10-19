import type { ManualMatchup } from '@ffd/shared';
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Leagues entered by hand (FFPC). The pasted matchup snapshot is a JSON document
// because it's only ever read and written whole, never queried by field.
export const manualLeagues = pgTable('manual_leagues', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: text('platform').notNull().default('ffpc'),
  name: text('name').notNull(),
  teamName: text('team_name').notNull().default(''),
  rosterText: text('roster_text').notNull(),
  matchup: jsonb('matchup').$type<ManualMatchup>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per league per week, overwritten as the week plays out, so after the
// week ends it holds the last values we saw. This is what the History tab reads.
export const leagueSnapshots = pgTable(
  'league_snapshots',
  {
    id: serial('id').primaryKey(),
    platform: text('platform').notNull(),
    leagueId: text('league_id').notNull(),
    leagueName: text('league_name').notNull(),
    season: text('season').notNull(),
    week: integer('week').notNull(),

    points: doublePrecision('points').notNull(),
    projected: doublePrecision('projected'),
    opponentName: text('opponent_name'),
    opponentPoints: doublePrecision('opponent_points'),
    opponentProjected: doublePrecision('opponent_projected'),

    // Set only for all-play weeks, where the top `allPlayWinSlots` teams win.
    allPlayRank: integer('all_play_rank'),
    allPlayTeams: integer('all_play_teams'),
    allPlayWinSlots: integer('all_play_win_slots'),

    // Your record and standing at the time of capture.
    wins: integer('wins'),
    losses: integer('losses'),
    ties: integer('ties'),
    standingRank: integer('standing_rank'),
    standingTeams: integer('standing_teams'),

    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('league_snapshots_league_week').on(t.platform, t.leagueId, t.season, t.week),
    index('league_snapshots_season_idx').on(t.season, t.week),
  ],
);

export type ManualLeagueRow = typeof manualLeagues.$inferSelect;
export type NewSnapshot = typeof leagueSnapshots.$inferInsert;
export type SnapshotRow = typeof leagueSnapshots.$inferSelect;
