CREATE TABLE "plan_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"race_date" date NOT NULL,
	"season_start" date NOT NULL,
	"windows" jsonb NOT NULL,
	"long_ride_dow" integer NOT NULL,
	"long_run_dow" integer NOT NULL,
	"rest_dow" integer NOT NULL,
	"joint_status" text NOT NULL,
	"pool_length_m" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_settings_single_row" CHECK ("plan_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "planned_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_date" date NOT NULL,
	"slot" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"duration_min" integer NOT NULL,
	"intensity" text NOT NULL,
	"details" jsonb NOT NULL,
	"rule_ids" text[] NOT NULL,
	"week_start" date NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"completed_ref" text,
	CONSTRAINT "planned_sessions_date_slot_unique" UNIQUE("local_date","slot")
);
--> statement-breakpoint
CREATE TABLE "recommendation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_date" date NOT NULL,
	"planned_session_id" uuid,
	"rule_id" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"effect" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_log_date_session_rule_unique" UNIQUE NULLS NOT DISTINCT("local_date","planned_session_id","rule_id")
);
--> statement-breakpoint
ALTER TABLE "recommendation_log" ADD CONSTRAINT "recommendation_log_planned_session_id_planned_sessions_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_sessions"("id") ON DELETE set null ON UPDATE no action;