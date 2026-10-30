CREATE TABLE "manual_matchup_weeks" (
	"league_id" uuid NOT NULL,
	"season" text NOT NULL,
	"week" integer NOT NULL,
	"matchup" jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "manual_matchup_weeks_league_id_season_week_pk" PRIMARY KEY("league_id","season","week")
);
--> statement-breakpoint
ALTER TABLE "league_snapshots" ADD COLUMN "estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_matchup_weeks" ADD CONSTRAINT "manual_matchup_weeks_league_id_manual_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."manual_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Keep the week each league has pasted so far. The season is the year it was
-- pasted, or the year before for January's last weeks (matchupSeason in store.ts).
INSERT INTO "manual_matchup_weeks" ("league_id", "season", "week", "matchup", "captured_at")
SELECT "id",
	(extract(year FROM ("matchup"->>'capturedAt')::timestamptz AT TIME ZONE 'UTC')
		- CASE WHEN extract(month FROM ("matchup"->>'capturedAt')::timestamptz AT TIME ZONE 'UTC') < 8 THEN 1 ELSE 0 END)::int::text,
	("matchup"->>'week')::int,
	"matchup",
	("matchup"->>'capturedAt')::timestamptz
FROM "manual_leagues"
WHERE "matchup" IS NOT NULL;
