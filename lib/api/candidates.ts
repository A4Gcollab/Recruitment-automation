import type {
  ApiError,
  Campaign,
  CandidatesListResponse,
  ColumnMapping,
  ImportResult,
  Uuid,
} from "@/lib/types";

export type CandidatesFilters = {
  campaign_id: Uuid;
  stage?: string;
  page?: number;
  page_size?: number;
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

// --- Import -------------------------------------------------------------

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
