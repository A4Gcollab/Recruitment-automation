export type Uuid = string;
export type IsoDateTime = string;

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
  template_type: string;
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

export type ColumnMapping = {
  full_name: string;
  role?: string;
  email?: string;
  linkedin_url?: string;
  headline?: string;
  location?: string;
  application_date?: string;
};

export type ImportError = { row: number; reason: string };
export type ImportResult = { imported: number; skipped: number; errors: ImportError[] };

export type CandidatesListResponse = {
  items: Candidate[];
  total: number;
  page: number;
  page_size: number;
};

export type ApiError = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};
