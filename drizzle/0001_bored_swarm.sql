CREATE TABLE "body_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scanned_on" date NOT NULL,
	"weight_lb" double precision,
	"lean_mass_lb" double precision,
	"skeletal_muscle_lb" double precision,
	"fat_mass_lb" double precision,
	"body_fat_pct" double precision,
	"bmr_kcal" double precision,
	"tee_kcal" double precision,
	"visceral_fat_level" integer,
	"extras" jsonb,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cardio_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"duration_s" integer NOT NULL,
	"distance_m" double precision,
	"avg_watts" integer,
	"incline_pct" double precision,
	"pool_length_m" double precision,
	"indoor" boolean DEFAULT false NOT NULL,
	"notes" text,
	"whoop_workout_id" text
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "lab_panels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawn_on" date NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panel_id" uuid NOT NULL,
	"marker" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"flag" text,
	CONSTRAINT "lab_results_panel_marker_unique" UNIQUE("panel_id","marker")
);
--> statement-breakpoint
CREATE TABLE "pain_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"local_date" date NOT NULL,
	"area" text NOT NULL,
	"side" text NOT NULL,
	"score" integer NOT NULL,
	"context" text NOT NULL,
	"cardio_entry_id" uuid
);
--> statement-breakpoint
CREATE TABLE "strength_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"local_date" date NOT NULL,
	"notes" text,
	"whoop_workout_id" text
);
--> statement-breakpoint
CREATE TABLE "strength_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"reps" integer NOT NULL,
	"weight_lb" double precision,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "strength_sets_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "weekly_metrics" (
	"week_start" date PRIMARY KEY NOT NULL,
	"vo2max" double precision,
	"whoop_age" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight_entries" (
	"local_date" date PRIMARY KEY NOT NULL,
	"weight_lb" double precision NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_panel_id_lab_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."lab_panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_entries" ADD CONSTRAINT "pain_entries_cardio_entry_id_cardio_entries_id_fk" FOREIGN KEY ("cardio_entry_id") REFERENCES "public"."cardio_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strength_sets" ADD CONSTRAINT "strength_sets_session_id_strength_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."strength_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strength_sets" ADD CONSTRAINT "strength_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;