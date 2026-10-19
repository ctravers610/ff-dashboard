CREATE TABLE "league_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"league_id" text NOT NULL,
	"league_name" text NOT NULL,
	"season" text NOT NULL,
	"week" integer NOT NULL,
	"points" double precision NOT NULL,
	"projected" double precision,
	"opponent_name" text,
	"opponent_points" double precision,
	"opponent_projected" double precision,
	"all_play_rank" integer,
	"all_play_teams" integer,
	"all_play_win_slots" integer,
	"wins" integer,
	"losses" integer,
	"ties" integer,
	"standing_rank" integer,
	"standing_teams" integer,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_snapshots_league_week" UNIQUE("platform","league_id","season","week")
);
--> statement-breakpoint
CREATE TABLE "manual_leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT 'ffpc' NOT NULL,
	"name" text NOT NULL,
	"team_name" text DEFAULT '' NOT NULL,
	"roster_text" text NOT NULL,
	"matchup" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "league_snapshots_season_idx" ON "league_snapshots" USING btree ("season","week");