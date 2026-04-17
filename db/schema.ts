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

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roleName: varchar("role_name", { length: 255 }).notNull(),
  googleSheetUrl: text("google_sheet_url"),
  googleFormLink: text("google_form_link"),
  zoomLink: text("zoom_link"),
  zoomMeetingId: varchar("zoom_meeting_id", { length: 50 }),
  zoomPasscode: varchar("zoom_passcode", { length: 50 }),
  interviewDate: varchar("interview_date", { length: 100 }),
  interviewTime: varchar("interview_time", { length: 50 }),
  interviewMode: varchar("interview_mode", { length: 50 }),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(),
  stage: varchar("stage", { length: 100 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stages = pgTable("stages", {
  id: varchar("id", { length: 100 }).primaryKey(),
  label: varchar("label", { length: 255 }).notNull(),
  position: integer("position").notNull(),
  triggersEmail: boolean("triggers_email").notNull().default(false),
  templateId: uuid("template_id").references(() => emailTemplates.id, {
    onDelete: "set null",
  }),
});

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),
    role: varchar("role", { length: 255 }).notNull(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 100 }).notNull().default("new"),
    emailEnriched: boolean("email_enriched").notNull().default(false),
    googleSheetRow: integer("google_sheet_row"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index("candidates_campaign_id_idx").on(t.campaignId),
    stageIdx: index("candidates_stage_idx").on(t.stage),
    emailUniqIdx: uniqueIndex("candidates_email_unique_idx")
      .on(t.email)
      .where(sql`${t.email} IS NOT NULL`),
  }),
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "restrict" }),
    resendMessageId: varchar("resend_message_id", { length: 255 }).unique(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    status: varchar("status", { length: 50 }).notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    candidateIdx: index("email_events_candidate_id_idx").on(t.candidateId),
    statusIdx: index("email_events_status_idx").on(t.status),
    idempotencyIdx: index("email_events_idempotency_key_idx").on(t.idempotencyKey),
  }),
);

export const scheduledSends = pgTable(
  "scheduled_sends",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "restrict" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pendingDueIdx: index("scheduled_sends_pending_due_idx")
      .on(t.scheduledFor)
      .where(sql`${t.status} = 'pending'`),
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

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type Stage = typeof stages.$inferSelect;
export type NewStage = typeof stages.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;
export type ScheduledSend = typeof scheduledSends.$inferSelect;
export type NewScheduledSend = typeof scheduledSends.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
