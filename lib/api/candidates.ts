import type {
  ApiError,
  Campaign as CampaignV1,
  Candidate as CandidateV1,
  CandidatesListResponse as CandidatesListResponseV1,
  ColumnMapping,
  ImportResult,
  Uuid,
} from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// v0.2 type shim
//
// CONTRACTS.md §4 has been republished for v0.2 (PR #15), but Basil's task #2
// schema/types PR has not landed yet, so `lib/types.ts` on main still exposes
// the v0.1 shape. We mirror the canonical v0.2 fields here verbatim so the
// Frontend can scaffold against real contracts now. Once Basil's PR merges:
//   1. delete these shim types
//   2. re-export `Campaign` + `Candidate` from `@/lib/types` directly
//   3. consumers keep working because the field names match CONTRACTS.md §4
//
// Reference: CONTRACTS.md §4 (Shared TypeScript Types — v0.2 additions).
// ────────────────────────────────────────────────────────────────────────────

export type Verdict = "good_fit" | "not_fit";
export type InterviewVerdict = "call_interview" | "reject";
export type TemplateType = "stage1" | "reminder" | "interview_link";

export type Campaign = CampaignV1 & {
  stage1_subject: string;
  stage1_body: string;
  reminder_subject: string;
  reminder_body: string;
  interview_subject: string;
  interview_body: string;
  reminder_after_days: number;
  form_response_sheet_url: string | null;
};

export type Candidate = CandidateV1 & {
  // ApplicantSync extras
  phone: string | null;
  current_title: string | null;
  current_company: string | null;
  school: string | null;
  resume_url: string | null;
  applicantsync_score: string | null;
  linkedin_data: Record<string, string>;

  // ChatGPT verdicts
  verdict: Verdict | null;
  reason: string | null;
  interview_verdict: InterviewVerdict | null;
  interview_reason: string | null;

  // Reminder timing
  stage1_sent_at: string | null;
  reminder_sent_at: string | null;
};

export type CandidatesListResponse = Omit<
  CandidatesListResponseV1,
  "items"
> & {
  items: Candidate[];
};

// v0.2 NEW response shapes (CONTRACTS.md §4)
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

export type EvaluationImportResult = {
  matched: number;
  updated: number;
  unmatched: Array<{
    row: number;
    email: string | null;
    linkedin_url: string | null;
    reason: "no_match" | "missing_verdict" | "wrong_stage" | "invalid_verdict";
  }>;
};

// ────────────────────────────────────────────────────────────────────────────

export type CandidatesFilters = {
  campaign_id: Uuid;
  stage?: string;
  page?: number;
  page_size?: number;
  verdict?: Verdict;
  interview_verdict?: InterviewVerdict;
};

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(status: number, payload: ApiError["error"]) {
    super(payload.message || "Request failed");
    this.name = "ApiClientError";
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  let body: ApiError | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    // fall through with a synthetic envelope
  }
  const errBody = body?.error ?? {
    code: res.status === 401 ? "unauthorized" : "internal_error",
    message: res.statusText || "Request failed",
  };
  throw new ApiClientError(res.status, errBody);
}

function buildQuery(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET", credentials: "include" });
  return parseOrThrow<T>(res);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseOrThrow<T>(res);
}

async function postMultipart<T>(url: string, form: FormData): Promise<T> {
  // No Content-Type header — browser sets multipart boundary automatically.
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  return parseOrThrow<T>(res);
}

// --- Campaigns ----------------------------------------------------------

export type CampaignListResponse = { items: Campaign[] };

export type CampaignDetail = Campaign & {
  counts_by_stage: { stage: string; count: number }[];
};

export type CreateCampaignPayload = {
  role_name: string;
  google_form_url?: string;
  zoom_link?: string;
  zoom_meeting_id?: string;
  zoom_passcode?: string;
  interview_date?: string;
  interview_time?: string;
  interview_mode?: string;

  // v0.2 additions — all optional; server falls back to seeded defaults.
  stage1_subject?: string;
  stage1_body?: string;
  reminder_subject?: string;
  reminder_body?: string;
  interview_subject?: string;
  interview_body?: string;
  reminder_after_days?: number;
  form_response_sheet_url?: string;
};

export function fetchCampaigns(): Promise<CampaignListResponse> {
  return getJson<CampaignListResponse>("/api/campaigns");
}

export function fetchCampaign(id: Uuid): Promise<CampaignDetail> {
  return getJson<CampaignDetail>(`/api/campaigns/${id}`);
}

export function createCampaign(
  payload: CreateCampaignPayload,
): Promise<Campaign> {
  return postJson<Campaign>("/api/campaigns", payload);
}

// --- Candidates ---------------------------------------------------------

export function fetchCandidates(
  filters: CandidatesFilters,
): Promise<CandidatesListResponse> {
  return getJson<CandidatesListResponse>(
    `/api/candidates${buildQuery(filters)}`,
  );
}

// --- Import (applicants from Sheet) -------------------------------------

export type ImportPayload = {
  google_sheet_url: string;
  column_mapping: ColumnMapping;
};

export function importCandidates(
  campaignId: Uuid,
  payload: ImportPayload,
): Promise<ImportResult> {
  return postJson<ImportResult>(
    `/api/campaigns/${campaignId}/import`,
    payload,
  );
}

// --- Emails -------------------------------------------------------------

export type SendEmailPayload = {
  candidate_id: Uuid;
  template_type: "stage1";
};

export type SendEmailResponse = {
  queued: true;
  idempotency_key: string;
};

export function sendEmail(
  payload: SendEmailPayload,
): Promise<SendEmailResponse> {
  return postJson<SendEmailResponse>("/api/emails/send", payload);
}

// --- v0.2 bulk operations ----------------------------------------------

/**
 * Browser-navigable URL for the XLSX export. We don't fetch the file with
 * `fetch()` here because then we'd have to plumb the Blob to a hidden anchor;
 * letting the browser GET it directly preserves the `Content-Disposition`
 * filename the server sends back.
 */
export function exportCandidatesUrl(campaignId: Uuid): string {
  return `/api/campaigns/${campaignId}/export-candidates`;
}

export type ImportEvaluationsType = "screen1" | "screen2";

export function importEvaluations(
  campaignId: Uuid,
  file: File,
  type: ImportEvaluationsType,
): Promise<EvaluationImportResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  return postMultipart<EvaluationImportResult>(
    `/api/campaigns/${campaignId}/import-evaluations?type=${encodeURIComponent(type)}`,
    form,
  );
}

export type SendBulkPayload = {
  template_type: "stage1" | "interview_link";
  candidate_ids: Uuid[];
};

export function sendBulk(
  campaignId: Uuid,
  payload: SendBulkPayload,
): Promise<BulkSendResult> {
  return postJson<BulkSendResult>(
    `/api/campaigns/${campaignId}/send-bulk`,
    payload,
  );
}
