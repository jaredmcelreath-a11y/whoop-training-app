CREATE TABLE "cycles" (
	"id" bigint PRIMARY KEY NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone,
	"timezone_offset" text NOT NULL,
	"score_state" text NOT NULL,
	"strain" double precision,
	"kilojoule" double precision,
	"kcal" double precision,
	"avg_hr" integer,
	"max_hr" integer
);
--> statement-breakpoint
CREATE TABLE "recoveries" (
	"cycle_id" bigint PRIMARY KEY NOT NULL,
	"sleep_id" text NOT NULL,
	"score_state" text NOT NULL,
	"recovery_score" double precision,
	"rhr" double precision,
	"hrv_rmssd_ms" double precision,
	"spo2_pct" double precision,
	"skin_temp_c" double precision,
	"user_calibrating" boolean
);
--> statement-breakpoint
CREATE TABLE "sleeps" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" bigint,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"timezone_offset" text NOT NULL,
	"nap" boolean DEFAULT false NOT NULL,
	"score_state" text NOT NULL,
	"asleep_min" double precision,
	"light_min" double precision,
	"sws_min" double precision,
	"rem_min" double precision,
	"awake_min" double precision,
	"performance_pct" double precision,
	"consistency_pct" double precision,
	"efficiency_pct" double precision,
	"respiratory_rate" double precision,
	"need_baseline_min" double precision,
	"need_debt_min" double precision,
	"need_strain_min" double precision,
	"need_nap_min" double precision
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"trace_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"object_id" text NOT NULL,
	"user_id" bigint,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "whoop_connection" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"whoop_user_id" bigint,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whoop_raw" (
	"resource" text NOT NULL,
	"id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whoop_raw_resource_id_pk" PRIMARY KEY("resource","id")
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"timezone_offset" text NOT NULL,
	"sport_name" text,
	"sport_id" integer,
	"score_state" text NOT NULL,
	"strain" double precision,
	"avg_hr" integer,
	"max_hr" integer,
	"kilojoule" double precision,
	"kcal" double precision,
	"distance_m" double precision,
	"altitude_gain_m" double precision,
	"zone_ms" jsonb
);
