CREATE TABLE "user_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" text NOT NULL,
	"title" text NOT NULL,
	"authors" text DEFAULT '' NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"year" integer,
	"url" text DEFAULT '' NOT NULL,
	"doi" text,
	"pmid" text,
	"evidence" text NOT NULL,
	"verified" boolean NOT NULL,
	"stance" text NOT NULL,
	"note" text,
	"proposal" text DEFAULT 'none' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
