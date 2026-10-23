ALTER TABLE "planned_sessions" ADD COLUMN "completed_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendation_log" ADD COLUMN "adapted" jsonb;