CREATE TABLE "manual_faab_claims" (
	"league_id" uuid NOT NULL,
	"season" text NOT NULL,
	"run_on" date NOT NULL,
	"week" integer NOT NULL,
	"player" text NOT NULL,
	"position" text NOT NULL,
	"nfl_team" text NOT NULL,
	"team" text NOT NULL,
	"bid" double precision NOT NULL,
	"losers" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_faab_claims_league_id_season_run_on_player_position_pk" PRIMARY KEY("league_id","season","run_on","player","position")
);
--> statement-breakpoint
ALTER TABLE "manual_faab_claims" ADD CONSTRAINT "manual_faab_claims_league_id_manual_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."manual_leagues"("id") ON DELETE cascade ON UPDATE no action;