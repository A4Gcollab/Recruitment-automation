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
  googleFormUrl: text("google_form_url"),
  zoomLink: text("zoom_link"),
  zoomMeetingId: varchar("zoom_meeting_id", { length: 50 }),
  zoomPasscode: varchar("zoom_passcode", { length: 50 }),
  interviewDate: varchar("interview_date", { length: 100 }),
  interviewTime: varchar("interview_time", { length: 50 }),
  interviewMode: varchar("interview_mode", { length: 50 }),
  status: varchar("status", { length: 50 }).notNull().default("active"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index("candidates_campaign_id_idx").on(t.campaignId),
    stageIdx: index("candidates_stage_idx").on(t.stage),
    emailUniqIdx: uniqueIndex("candidates_email_campaign_uniq")
      .on(t.email, t.campaignId)
      .where(sql`${t.email} IS NOT NULL`),
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
