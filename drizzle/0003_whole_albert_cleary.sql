CREATE TABLE "energy_estimates" (
	"week_start" date PRIMARY KEY NOT NULL,
	"tdee_kcal" double precision NOT NULL,
	"confidence" text NOT NULL,
	"method" text NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_days" (
	"local_date" date PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"kcal" double precision,
	"protein_g" double precision,
	"carbs_g" double precision,
	"fat_g" double precision,
	"fiber_g" double precision,
	"water_ml" double precision,
	"micros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"ref_profile" text,
	"meals_per_day" integer DEFAULT 4 NOT NULL,
	"water_source" text DEFAULT 'app' NOT NULL,
	"supplements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gain_goal_lb" double precision DEFAULT 15 NOT NULL,
	"gain_start_weight_lb" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_settings_single_row" CHECK ("nutrition_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sweat_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tested_on" date NOT NULL,
	"pre_lb" double precision NOT NULL,
	"post_lb" double precision NOT NULL,
	"fluid_ml" double precision NOT NULL,
	"duration_min" double precision NOT NULL,
	"kind" text NOT NULL,
	"sweat_rate_lph" double precision NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "water_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"ml" double precision NOT NULL,
	CONSTRAINT "water_entries_client_id_unique" UNIQUE("client_id")
);
