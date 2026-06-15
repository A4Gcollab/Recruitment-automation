export type Uuid = string;
export type IsoDateTime = string;

export type Verdict = "good_fit" | "not_fit";
export type InterviewVerdict = "call_interview" | "reject";
export type TemplateType = "stage1" | "reminder" | "interview_link";

export type Campaign = {
  id: Uuid;
  role_name: string;
  google_form_url: string | null;
  zoom_link: string | null;
  zoom_meeting_id: string | null;
  zoom_passcode: string | null;
  interview_date: string | null;
  interview_time: string | null;
  interview_mode: string | null;
  status: "active" | "paused" | "closed";
  created_at: IsoDateTime;

  // v0.2 — per-campaign editable email templates + reminder config + form-response sheet
  stage1_subject: string;
  stage1_body: string;
  reminder_subject: string;
  reminder_body: string;
  interview_subject: string;
  interview_body: string;
  reminder_after_days: number;
  form_response_sheet_url: string | null;
};

export type Candidate = {
  id: Uuid;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  headline: string | null;
  location: string | null;
  application_date: string | null;
  campaign_id: Uuid;
  stage: string;
  email_enriched: boolean;
  notes: string | null;
  google_sheet_row: number | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;

  // v0.2 — extra ApplicantSync fields
  phone: string | null;
  current_title: string | null;
  current_company: string | null;
  school: string | null;
  resume_url: string | null;
  applicantsync_score: string | null;
  linkedin_data: Record<string, string>;

  // v0.2 — ChatGPT verdicts
  verdict: Verdict | null;
  reason: string | null;
  interview_verdict: InterviewVerdict | null;
  interview_reason: string | null;

  // v0.2 — reminder timing
  stage1_sent_at: IsoDateTime | null;
  reminder_sent_at: IsoDateTime | null;

  // v0.3 — WhatsApp
  wa_status: string | null;
  wa_last_sent_at: IsoDateTime | null;
  wa_last_reply: string | null;
  wa_last_reply_at: IsoDateTime | null;
};

export type RoleConfig = {
  id: Uuid;
  role_name: string;
  google_form_url: string | null;
  zoom_link: string | null;
  zoom_meeting_id: string | null;
  zoom_passcode: string | null;
  default_interview_date: string | null;
  default_interview_time: string | null;
  interview_mode: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
};

export type EmailQueueItem = {
  id: Uuid;
  candidate_id: Uuid;
  campaign_id: Uuid;
  template_type: TemplateType;
  scheduled_for: IsoDateTime;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  retry_count: number;
  idempotency_key: string;
  error_message: string | null;
  sent_at: IsoDateTime | null;
  created_at: IsoDateTime;
};

export type Stage = {
  id: string;
  label: string;
  position: number;
};

export type AuditLogEntry = {
  id: Uuid;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: Uuid;
  metadata: Record<string, unknown> | null;
  created_at: IsoDateTime;
};

// v0.2 — one row per Google Form submission
export type FormResponse = {
  id: Uuid;
  candidate_id: Uuid;
  campaign_id: Uuid;
  responses: Record<string, string>;
  submitted_at: IsoDateTime;
  created_at: IsoDateTime;
};

// v0.2 — interleaves the 6 new ApplicantSync optional keys (phone, current_title,
// current_company, school, resume_url, applicantsync_score) into the order Iris's
// `SheetRow` uses, so visual diffs against `lib/sheets/fetchRows.ts` stay clean.
export type ColumnMapping = {
  full_name: string;
  role?: string;
  email?: string;
  phone?: string;                  // v0.2
  linkedin_url?: string;
  headline?: string;
  current_title?: string;          // v0.2
  current_company?: string;        // v0.2
  school?: string;                 // v0.2
  location?: string;
  application_date?: string;
  resume_url?: string;             // v0.2
  applicantsync_score?: string;    // v0.2
};

export type ImportError = { row: number; reason: string };
export type ImportResult = { imported: number; skipped: number; errors: ImportError[] };

export type CandidatesListResponse = {
  items: Candidate[];
  total: number;
  page: number;
  page_size: number;
};

// v0.2 — XLSX evaluation re-import
export type EvaluationImportUnmatched = {
  row: number;
  email: string | null;
  linkedin_url: string | null;
  reason: "no_match" | "missing_verdict" | "wrong_stage" | "invalid_verdict";
};

export type EvaluationImportResult = {
  matched: number;
  updated: number;
  unmatched: EvaluationImportUnmatched[];
};

// v0.2 — two-file filtered import (LinkedIn good-fit list + ApplicantSync data)
export type ImportFilteredResult = {
  goodfit_total: number;
  data_total: number;
  matched: number;
  imported: number;
  skipped_existing: number;
  skipped_no_email: number;
  unmatched_goodfit_names: string[];
};

// v0.2 — bulk email send
export type BulkSendSkipReason =
  | "verdict_not_good_fit"
  | "verdict_not_call_interview"
  | "already_sent"
  | "no_email"
  | "wrong_stage"
  | "candidate_not_found";

export type BulkSendResult = {
  queued: number;
  skipped: Array<{ candidate_id: Uuid; reason: BulkSendSkipReason }>;
};

// v0.2 — pull Google Form responses
export type PullResponsesUnmatched = {
  row: number;
  email: string | null;
  reason: "no_candidate_match" | "missing_email";
};

export type PullResponsesResult = {
  pulled: number;
  matched: number;
  unmatched: PullResponsesUnmatched[];
  deduped: number;
};

export type ApiError = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};
