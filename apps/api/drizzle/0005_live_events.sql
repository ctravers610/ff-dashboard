CREATE TABLE "live_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" text NOT NULL,
	"week" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "live_events_week" ON "live_events" USING btree ("season","week","id");