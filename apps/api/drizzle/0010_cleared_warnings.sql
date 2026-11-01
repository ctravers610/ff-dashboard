CREATE TABLE "cleared_warnings" (
	"season" text NOT NULL,
	"week" integer NOT NULL,
	"player_key" text NOT NULL,
	"cleared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cleared_warnings_season_week_player_key_pk" PRIMARY KEY("season","week","player_key")
);
