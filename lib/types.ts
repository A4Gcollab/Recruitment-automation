// Shared types — authoritative shapes published in CONTRACTS.md §4.
// Frontend and Integrations import from here. Do not redefine elsewhere.

export type Uuid = string;
export type IsoDateTime = string; // ISO 8601 UTC

export type Candidate = {
  id: Uuid;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  role: string;
  campaign_id: Uuid;
  stage: string;
  email_enriched: boolean;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
};

export type Campaign = {
  id: Uuid;
  role_name: string;
  google_sheet_url: string | null;
  google_form_link: string | null;
  zoom_link: string | null;
  zoom_meeting_id: string | null;
  zoom_passcode: string | null;
  interview_date: string | null;
  interview_time: string | null;
  interview_mode: string | null;
  status: "active" | "paused" | "closed";
  created_at: IsoDateTime;
};

export type Stage = {
  id: string;
  label: string;
  position: number;
  triggers_email: boolean;
  template_id: Uuid | null;
};

export type ColumnMapping = {
  full_name: string;
  role: string;
  email?: string;
  linkedin_url?: string;
};

export type ImportError = { row: number; reason: string };

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: ImportError[];
};

export type CandidatesListResponse = {
  items: Candidate[];
  total: number;
  page: number;
  page_size: number;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
