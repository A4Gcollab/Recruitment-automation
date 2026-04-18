-- PRD v1.0 → v2.1 pivot. Drop v1.0 tables (safe: v1.0 had no production data).
-- v1.0 tables dropped: scheduled_sends, email_events, email_templates, candidates, stages, campaigns, audit_log
DROP TABLE IF EXISTS "scheduled_sends" CASCADE;
DROP TABLE IF EXISTS "email_events" CASCADE;
DROP TABLE IF EXISTS "email_templates" CASCADE;
DROP TABLE IF EXISTS "candidates" CASCADE;
DROP TABLE IF EXISTS "stages" CASCADE;
DROP TABLE IF EXISTS "campaigns" CASCADE;
DROP TABLE IF EXISTS "audit_log" CASCADE;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" varchar(255) NOT NULL,
	"action" varchar(255) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_name" varchar(255) NOT NULL,
	"google_form_url" text,
	"zoom_link" text,
	"zoom_meeting_id" varchar(50),
	"zoom_passcode" varchar(50),
	"interview_date" varchar(100),
	"interview_time" varchar(50),
	"interview_mode" varchar(50),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(320),
	"linkedin_url" varchar(500),
	"headline" varchar(500),
	"location" varchar(255),
	"application_date" varchar(100),
	"campaign_id" uuid NOT NULL,
	"stage" varchar(100) DEFAULT 'imported' NOT NULL,
	"email_enriched" boolean DEFAULT false NOT NULL,
	"notes" text,
	"google_sheet_row" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"template_type" varchar(50) NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_queue_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_name" varchar(255) NOT NULL,
	"google_form_url" text,
	"zoom_link" text,
	"zoom_meeting_id" varchar(50),
	"zoom_passcode" varchar(50),
	"default_interview_date" varchar(100),
	"default_interview_time" varchar(50),
	"interview_mode" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_configs_role_name_unique" UNIQUE("role_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stages" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"label" varchar(255) NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidates" ADD CONSTRAINT "candidates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_id_idx" ON "audit_log" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidates_campaign_id_idx" ON "candidates" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidates_stage_idx" ON "candidates" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "candidates_email_campaign_uniq" ON "candidates" USING btree ("email","campaign_id") WHERE "candidates"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_queue_pending_due_idx" ON "email_queue" USING btree ("scheduled_for") WHERE "email_queue"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_queue_candidate_id_idx" ON "email_queue" USING btree ("candidate_id");