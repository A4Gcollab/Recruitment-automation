import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  DEFAULT_INTERVIEW_BODY,
  DEFAULT_INTERVIEW_SUBJECT,
  DEFAULT_REMINDER_AFTER_DAYS,
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_SUBJECT,
  DEFAULT_STAGE1_BODY,
  DEFAULT_STAGE1_SUBJECT,
} from "@/lib/email/defaults";

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roleName: varchar("role_name", { length: 255 }).notNull(),
  googleFormUrl: text("google_form_url"),
  zoomLink: text("zoom_link"),
  zoomMeetingId: varchar("zoom_meeting_id", { length: 50 }),
  zoomPasscode: varchar("zoom_passcode", { length: 50 }),
  interviewDate: varchar("interview_date", { length: 100 }),
  interviewTime: varchar("interview_time", { length: 50 }),
  interviewMode: varchar("interview_mode", { length: 50 }),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  // v0.2 — per-campaign editable email templates; defaults seeded from lib/email/defaults
  stage1Subject: text("stage1_subject").notNull().default(DEFAULT_STAGE1_SUBJECT),
  stage1Body: text("stage1_body").notNull().default(DEFAULT_STAGE1_BODY),
  reminderSubject: text("reminder_subject").notNull().default(DEFAULT_REMINDER_SUBJECT),
  reminderBody: text("reminder_body").notNull().default(DEFAULT_REMINDER_BODY),
  interviewSubject: text("interview_subject").notNull().default(DEFAULT_INTERVIEW_SUBJECT),
  interviewBody: text("interview_body").notNull().default(DEFAULT_INTERVIEW_BODY),
  reminderAfterDays: integer("reminder_after_days").notNull().default(DEFAULT_REMINDER_AFTER_DAYS),
  formResponseSheetUrl: text("form_response_sheet_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roleConfigs = pgTable("role_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roleName: varchar("role_name", { length: 255 }).notNull().unique(),
  googleFormUrl: text("google_form_url"),
  zoomLink: text("zoom_link"),
  zoomMeetingId: varchar("zoom_meeting_id", { length: 50 }),
  zoomPasscode: varchar("zoom_passcode", { length: 50 }),
  defaultInterviewDate: varchar("default_interview_date", { length: 100 }),
  defaultInterviewTime: varchar("default_interview_time", { length: 50 }),
  interviewMode: varchar("interview_mode", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),
    headline: varchar("headline", { length: 500 }),
    location: varchar("location", { length: 255 }),
    applicationDate: varchar("application_date", { length: 100 }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 100 }).notNull().default("imported"),
    emailEnriched: boolean("email_enriched").notNull().default(false),
    notes: text("notes"),
    googleSheetRow: integer("google_sheet_row"),
    // v0.2 — extra ApplicantSync fields
    phone: varchar("phone", { length: 50 }),
    currentTitle: varchar("current_title", { length: 255 }),
    currentCompany: varchar("current_company", { length: 255 }),
    school: varchar("school", { length: 255 }),
    resumeUrl: text("resume_url"),
    applicantsyncScore: varchar("applicantsync_score", { length: 20 }),
    // v0.2 — JSONB bag of non-standard sheet columns; default {} (never null)
    linkedinData: jsonb("linkedin_data")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // v0.2 — ChatGPT verdicts (Screen-1 / Screen-2)
    verdict: varchar("verdict", { length: 20 }),
    reason: text("reason"),
    interviewVerdict: varchar("interview_verdict", { length: 20 }),
    interviewReason: text("interview_reason"),
    // v0.2 — reminder timing
    stage1SentAt: timestamp("stage1_sent_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    // v0.3 — WhatsApp status tracking
    waStatus: varchar("wa_status", { length: 50 }),
    waLastSentAt: timestamp("wa_last_sent_at", { withTimezone: true }),
    waLastReply: text("wa_last_reply"),
    waLastReplyAt: timestamp("wa_last_reply_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index("candidates_campaign_id_idx").on(t.campaignId),
    stageIdx: index("candidates_stage_idx").on(t.stage),
    emailUniqIdx: uniqueIndex("candidates_email_campaign_uniq")
      .on(t.email, t.campaignId)
      .where(sql`${t.email} IS NOT NULL`),
    // v0.2 — supports reminder cron scan
    reminderScanIdx: index("candidates_reminder_scan_idx")
      .on(t.stage1SentAt)
      .where(sql`${t.stage} = 'stage1_sent' AND ${t.reminderSentAt} IS NULL`),
    // v0.2 — supports bulk-send precondition checks + filter chips
    verdictIdx: index("candidates_verdict_idx").on(t.campaignId, t.verdict),
    interviewVerdictIdx: index("candidates_interview_verdict_idx").on(
      t.campaignId,
      t.interviewVerdict,
    ),
  }),
);

export const emailQueue = pgTable(
  "email_queue",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    templateType: varchar("template_type", { length: 50 }).notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pendingDueIdx: index("email_queue_pending_due_idx")
      .on(t.scheduledFor)
      .where(sql`${t.status} = 'pending'`),
    candidateIdx: index("email_queue_candidate_id_idx").on(t.candidateId),
  }),
);

export const stages = pgTable("stages", {
  id: varchar("id", { length: 100 }).primaryKey(),
  label: varchar("label", { length: 255 }).notNull(),
  position: integer("position").notNull(),
});

// v0.2 — one row per Google Form submission; matched back to candidate by email
export const formResponses = pgTable(
  "form_responses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    responses: jsonb("responses")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    candidateIdx: index("form_responses_candidate_id_idx").on(t.candidateId),
    campaignIdx: index("form_responses_campaign_id_idx").on(t.campaignId),
    // dedup key for pull-responses upsert (same submission re-pulled = no-op)
    candidateSubmittedUniq: uniqueIndex("form_responses_candidate_submitted_uniq").on(
      t.candidateId,
      t.submittedAt,
    ),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    actor: varchar("actor", { length: 255 }).notNull(),
    action: varchar("action", { length: 255 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("audit_log_entity_id_idx").on(t.entityId),
    createdAtIdx: index("audit_log_created_at_idx").on(t.createdAt.desc()),
  }),
);

// v0.3 — WhatsApp message log (audit trail for every outbound/inbound message)
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    direction: varchar("direction", { length: 10 }).notNull().default("outbound"),
    waMessageId: varchar("wa_message_id", { length: 255 }),
    templateName: varchar("template_name", { length: 100 }),
    body: text("body"),
    status: varchar("status", { length: 50 }).notNull().default("sent"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    candidateIdx: index("whatsapp_messages_candidate_idx").on(t.candidateId),
    campaignIdx: index("whatsapp_messages_campaign_idx").on(t.campaignId),
    waMessageIdIdx: index("whatsapp_messages_wa_message_id_idx").on(t.waMessageId),
  }),
);

// v0.3 — WhatsApp send queue (mirrors email_queue pattern)
export const whatsappQueue = pgTable(
  "whatsapp_queue",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    templateName: varchar("template_name", { length: 100 }).notNull(),
    templateParams: jsonb("template_params")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    waMessageId: varchar("wa_message_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pendingDueIdx: index("whatsapp_queue_pending_due_idx")
      .on(t.scheduledFor)
      .where(sql`${t.status} = 'pending'`),
    candidateIdx: index("whatsapp_queue_candidate_idx").on(t.candidateId),
  }),
);

export type CampaignRow = typeof campaigns.$inferSelect;
export type NewCampaignRow = typeof campaigns.$inferInsert;
export type RoleConfigRow = typeof roleConfigs.$inferSelect;
export type NewRoleConfigRow = typeof roleConfigs.$inferInsert;
export type CandidateRow = typeof candidates.$inferSelect;
export type NewCandidateRow = typeof candidates.$inferInsert;
export type EmailQueueRow = typeof emailQueue.$inferSelect;
export type NewEmailQueueRow = typeof emailQueue.$inferInsert;
export type StageRow = typeof stages.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type FormResponseRow = typeof formResponses.$inferSelect;
export type NewFormResponseRow = typeof formResponses.$inferInsert;
export type WhatsAppMessageRow = typeof whatsappMessages.$inferSelect;
export type NewWhatsAppMessageRow = typeof whatsappMessages.$inferInsert;
export type WhatsAppQueueRow = typeof whatsappQueue.$inferSelect;
export type NewWhatsAppQueueRow = typeof whatsappQueue.$inferInsert;
