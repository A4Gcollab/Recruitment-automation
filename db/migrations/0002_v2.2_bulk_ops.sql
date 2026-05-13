-- v0.2 — Hybrid HR-Automation pivot (REQUIREMENTS_v2.2.md):
--   - extend candidates with ApplicantSync + ChatGPT verdict + reminder timing columns
--   - extend campaigns with 6 per-campaign editable email templates + reminder cadence + form-response sheet URL
--   - create form_responses table
--   - seed 5 new stages (positions 10–14)
--
-- Column DEFAULTs on the campaigns templates intentionally mirror lib/email/defaults.ts so
-- existing v0.1 campaign rows are backfilled by Postgres on ADD COLUMN (PG ≥ 11 stores the
-- default as a "missing value" — no table rewrite). New rows that omit the field via the
-- Drizzle insert get the same defaults.

ALTER TABLE "candidates"
  ADD COLUMN IF NOT EXISTS "phone" varchar(50),
  ADD COLUMN IF NOT EXISTS "current_title" varchar(255),
  ADD COLUMN IF NOT EXISTS "current_company" varchar(255),
  ADD COLUMN IF NOT EXISTS "school" varchar(255),
  ADD COLUMN IF NOT EXISTS "resume_url" text,
  ADD COLUMN IF NOT EXISTS "applicantsync_score" varchar(20),
  ADD COLUMN IF NOT EXISTS "linkedin_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "verdict" varchar(20),
  ADD COLUMN IF NOT EXISTS "reason" text,
  ADD COLUMN IF NOT EXISTS "interview_verdict" varchar(20),
  ADD COLUMN IF NOT EXISTS "interview_reason" text,
  ADD COLUMN IF NOT EXISTS "stage1_sent_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "stage1_subject" text NOT NULL DEFAULT $a4g$Next Step — Stage-1 Screening Form$a4g$,
  ADD COLUMN IF NOT EXISTS "stage1_body" text NOT NULL DEFAULT $a4g$Dear {{name}},

Thank you for your interest in the role at our organization.

As the next step in our selection process, please complete the Stage-1 Screening Form within 24 hours of receiving this email:

{{form_link}}

Your responses will help us understand your alignment with the role. Based on the evaluation, selected candidates will be invited for an online interaction.

Please note: only candidates who submit the form within the given timeline will be considered for the interview stage.

Deadline: {{deadline}}

Warm regards,
HR Team

(If you did not apply for this role, please disregard this email.)$a4g$,
  ADD COLUMN IF NOT EXISTS "reminder_subject" text NOT NULL DEFAULT $a4g$Reminder — Stage-1 Screening Form still pending$a4g$,
  ADD COLUMN IF NOT EXISTS "reminder_body" text NOT NULL DEFAULT $a4g$Hi {{name}},

This is a gentle reminder to complete the Stage-1 Screening Form for the role you applied to:

{{form_link}}

We have not received your submission yet. The deadline is {{deadline}} — only candidates who submit by then can move to the interview stage.

If you have already submitted the form, please ignore this message.

Warm regards,
HR Team$a4g$,
  ADD COLUMN IF NOT EXISTS "interview_subject" text NOT NULL DEFAULT $a4g$Interview Invitation — Next Round$a4g$,
  ADD COLUMN IF NOT EXISTS "interview_body" text NOT NULL DEFAULT $a4g$Dear {{name}},

Congratulations — you have been shortlisted for an interview based on your Stage-1 responses.

Interview details:
- Date: {{interview_date}}
- Time: {{interview_time}}
- Zoom link: {{zoom_link}}
- Meeting ID: {{zoom_meeting_id}}
- Passcode: {{zoom_passcode}}

Please confirm your availability by replying to this email.

Warm regards,
HR Team$a4g$,
  ADD COLUMN IF NOT EXISTS "reminder_after_days" integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "form_response_sheet_url" text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "form_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "form_responses_candidate_id_idx" ON "form_responses" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_responses_campaign_id_idx" ON "form_responses" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "form_responses_candidate_submitted_uniq" ON "form_responses" USING btree ("candidate_id","submitted_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "candidates_reminder_scan_idx" ON "candidates" USING btree ("stage1_sent_at") WHERE "candidates"."stage" = 'stage1_sent' AND "candidates"."reminder_sent_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidates_verdict_idx" ON "candidates" USING btree ("campaign_id","verdict");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidates_interview_verdict_idx" ON "candidates" USING btree ("campaign_id","interview_verdict");--> statement-breakpoint

-- Seed 5 new v0.2 stages (positions 10–14). Idempotent.
INSERT INTO "stages" ("id","label","position") VALUES
	('evaluated_screen1', 'Evaluated — Screen 1 (Good Fit)', 10),
	('rejected_screen1', 'Rejected — Screen 1', 11),
	('evaluated_screen2', 'Evaluated — Screen 2 (Call for Interview)', 12),
	('rejected_screen2', 'Rejected — Screen 2', 13),
	('interview_link_sent', 'Interview Link Sent', 14)
ON CONFLICT ("id") DO NOTHING;
