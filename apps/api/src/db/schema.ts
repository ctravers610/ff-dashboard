import type { ManualMatchup } from '@ffd/shared';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
  // FFPC's add/drop page as pasted, for the Waivers tab (parsed when read).
  waiversText: text('waivers_text'),
  waiversCapturedAt: timestamp('waivers_captured_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Every week's pasted matchup, not just the latest one in manual_leagues, so a
// week that ended unrecorded can be re-scored from its starters (backfill.ts).
// A later paste of the same week replaces an earlier one.
export const manualMatchupWeeks = pgTable(
  'manual_matchup_weeks',
  {
    leagueId: uuid('league_id')
      .notNull()
      .references(() => manualLeagues.id, { onDelete: 'cascade' }),
    season: text('season').notNull(),
    week: integer('week').notNull(),
    matchup: jsonb('matchup').$type<ManualMatchup>().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.season, t.week] })],
);

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

    // Re-scored by the app from a pasted lineup that could still have changed
    // (a late swap) or an all-play scoreboard pasted mid-week, rather than read
    // from the platform or captured after the week ended.
    estimated: boolean('estimated').notNull().default(false),

    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('league_snapshots_league_week').on(t.platform, t.leagueId, t.season, t.week),
    index('league_snapshots_season_idx').on(t.season, t.week),
  ],
);

// Signed-in browser sessions. The cookie holds a random token; only its SHA-256
// hash is stored, so a copy of this table can't be used to impersonate anyone.
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    githubId: bigint('github_id', { mode: 'number' }).notNull(),
    login: text('login').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_expires_idx').on(t.expiresAt)],
);

// OAuth tokens for connected services (Yahoo), encrypted with TOKEN_ENCRYPTION_KEY.
export const oauthTokens = pgTable('oauth_tokens', {
  provider: text('provider').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ManualLeagueRow = typeof manualLeagues.$inferSelect;
export type ManualMatchupWeekRow = typeof manualMatchupWeeks.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSnapshot = typeof leagueSnapshots.$inferInsert;
export type SnapshotRow = typeof leagueSnapshots.$inferSelect;

// Browsers that asked for waiver reminders. The endpoint is the browser's push
// address; p256dh and auth are the keys each message is encrypted with.
export const pushSubscriptions = pgTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per league per waiver run that needed attention: when you said your
// claims were in, and when a reminder went out (so each run reminds once).
export const waiverReminders = pgTable(
  'waiver_reminders',
  {
    platform: text('platform').notNull(),
    leagueId: text('league_id').notNull(),
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    claimsSetAt: timestamp('claims_set_at', { withTimezone: true }),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.platform, t.leagueId, t.runAt] })],
);

// Accounts and leagues added in the app: a Sleeper username (all its leagues)
// or an ESPN league id. Ones in .env are added on top and aren't stored here.
export const leagueSources = pgTable(
  'league_sources',
  {
    id: serial('id').primaryKey(),
    platform: text('platform').notNull(), // 'sleeper' | 'espn'
    value: text('value').notNull(), // username or league id
    label: text('label'), // what the platform calls it, shown in the list
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('league_sources_platform_value').on(t.platform, t.value)],
);

// The live feed: each scoring change while games are on, kept for the week.
export const liveEvents = pgTable(
  'live_events',
  {
    id: serial('id').primaryKey(),
    season: text('season').notNull(),
    week: integer('week').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    event: jsonb('event').notNull(), // player, description and per-league points
  },
  (t) => [index('live_events_week').on(t.season, t.week, t.id)],
);

// One row per notification sent for something that should only be sent once
// (a lineup problem in a given week), keyed by what it was about.
export const notificationsSent = pgTable('notifications_sent', {
  key: text('key').primaryKey(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
