CREATE TABLE "win_chances" (
	"season" text NOT NULL,
	"week" integer NOT NULL,
	"league_key" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"chance" real NOT NULL,
	CONSTRAINT "win_chances_season_week_league_key_at_pk" PRIMARY KEY("season","week","league_key","at")
);
