ALTER TABLE "plan_settings" ADD COLUMN "start_swim_sec_per_100yd" integer;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD COLUMN "start_run_sec_per_mi" integer;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD COLUMN "start_bike_mph" double precision;--> statement-breakpoint
ALTER TABLE "plan_settings" ADD COLUMN "goal_sec" integer;