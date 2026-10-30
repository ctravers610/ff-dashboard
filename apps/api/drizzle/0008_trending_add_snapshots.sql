CREATE TABLE "trending_add_snapshots" (
	"day" date NOT NULL,
	"season" text NOT NULL,
	"week" integer NOT NULL,
	"player_key" text NOT NULL,
	"position" text NOT NULL,
	"adds" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trending_add_snapshots_day_player_key_pk" PRIMARY KEY("day","player_key")
);
