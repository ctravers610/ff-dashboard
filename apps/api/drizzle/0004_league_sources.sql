CREATE TABLE "league_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_sources_platform_value" UNIQUE("platform","value")
);
