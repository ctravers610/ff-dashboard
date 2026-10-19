CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiver_reminders" (
	"platform" text NOT NULL,
	"league_id" text NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"claims_set_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	CONSTRAINT "waiver_reminders_platform_league_id_run_at_pk" PRIMARY KEY("platform","league_id","run_at")
);
