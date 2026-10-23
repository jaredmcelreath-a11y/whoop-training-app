CREATE TABLE "race_projections" (
	"week_start" date PRIMARY KEY NOT NULL,
	"swim_s" integer NOT NULL,
	"bike_s" integer NOT NULL,
	"run_s" integer NOT NULL,
	"transition_s" integer NOT NULL,
	"total_s" integer NOT NULL,
	"estimates" jsonb NOT NULL,
	"inputs" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
