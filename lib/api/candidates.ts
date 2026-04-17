import type {
  ApiError,
  CandidatesListResponse,
  ColumnMapping,
  ImportResult,
  Uuid,
} from "@/lib/types";

export type CandidatesFilters = {
  campaign_id?: Uuid;
  stage?: string;
  role?: string;
  has_email?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
};

class ApiClientError extends Error {
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

function buildQuery(filters: CandidatesFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchCandidates(
  filters: CandidatesFilters = {},
): Promise<CandidatesListResponse> {
  const res = await fetch(`/api/candidates${buildQuery(filters)}`, {
    method: "GET",
    credentials: "include",
  });
  return parseOrThrow<CandidatesListResponse>(res);
}

export type ImportPayload = {
  google_sheet_url: string;
  campaign_id: Uuid;
  column_mapping: ColumnMapping;
};

export async function importCandidates(
  payload: ImportPayload,
): Promise<ImportResult> {
  const res = await fetch("/api/candidates/import", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<ImportResult>(res);
}

export { ApiClientError };
