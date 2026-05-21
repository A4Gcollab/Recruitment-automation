# CONTRACTS — Shared interfaces between agents (v2.1)

Authoritative contract between Backend, Frontend, and Integrations agents. Anything here can be relied on; anything not here does not yet exist. Backend is the primary author for API endpoints; Integrations owns external service env vars and library signatures. Frontend never invents — it only consumes.

Last updated: 2026-05-20 (v2.2 pivot — XLSX round-trip + bulk emails; AI eval engine cut)

---

## 1. Environment Variables

| Name | Required for | Owner | Purpose |
|---|---|---|---|
| `DATABASE_URL` | v0.1+ | Orchestrator | PostgreSQL connection string (local: WSL native; prod: Neon) |
| `NEXTAUTH_SECRET` | v0.1+ | Orchestrator | NextAuth JWT signing secret |
| `NEXTAUTH_URL` | v0.1+ | Orchestrator | Public URL of the app |
| `ADMIN_EMAIL` | v0.1+ | Orchestrator | Single admin login email |
| `ADMIN_PASSWORD_HASH` | v0.1+ | Orchestrator | bcrypt hash (escape `$` with `\$` in `.env.local`) |
| `GMAIL_USER` | v0.1+ | Integrations | Gmail address for sending (e.g. `hr.omysha@gmail.com`) |
| `GMAIL_APP_PASSWORD` | v0.1+ | Integrations | 16-char Gmail App Password |
| `GMAIL_SENDER_NAME` | v0.1+ | Integrations | Display name (e.g. `Omysha Foundation — HR Team`) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | v0.1+ | Integrations | Service account for Sheets API |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | v0.1+ | Integrations | PEM private key |
| `SENDING_WINDOW_START_IST` | v0.1+ | Backend | Default `9` |
| `SENDING_WINDOW_END_IST` | v0.1+ | Backend | Default `18` |
| `HOURLY_SEND_CAP` | v0.1+ | Backend | Default `20` |
| `SEND_DELAY_MIN_SECONDS` | v0.1+ | Backend | Default `30` |
| `SEND_DELAY_MAX_SECONDS` | v0.1+ | Backend | Default `60` |
| `KILL_SWITCH_EMAIL` | v0.1+ | Backend | `true` halts all sends |
| `GMAIL_CLIENT_ID` | v0.3+ | Integrations | OAuth for Gmail API reply detection |
| `GMAIL_CLIENT_SECRET` | v0.3+ | Integrations | OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | v0.3+ | Integrations | OAuth refresh token |

---

## 2. API Endpoints

Published by Basil. All endpoints require an authenticated session (NextAuth v5 cookie) unless noted otherwise. Cron endpoints are protected by `Authorization: Bearer ${CRON_SECRET}` instead.

### Response conventions

- **Success**: documented payload directly (no wrapper).
- **Error**: `{ error: { code: string, message: string, details?: Record<string, unknown> } }`.
- **Timestamps**: ISO 8601 UTC. **IDs**: UUID v4.

### 2.1 `GET /api/health` (v0.1)

Public. Returns `{ status: "ok", db: "ok" | "error" }`.

### 2.2 `POST /api/campaigns` (v0.1, extended in v0.2)

Create a campaign. Auth: required.

**Request body:**
```ts
{
  role_name: string;                 // required, 1–255
  google_form_url?: string;          // URL
  zoom_link?: string;                // URL
  zoom_meeting_id?: string;
  zoom_passcode?: string;
  interview_date?: string;
  interview_time?: string;
  interview_mode?: string;

  // v0.2 additions — all optional; server falls back to module-level defaults
  stage1_subject?: string;
  stage1_body?: string;
  reminder_subject?: string;
  reminder_body?: string;
  interview_subject?: string;
  interview_body?: string;
  reminder_after_days?: number;      // default 3
  form_response_sheet_url?: string;  // Google Sheet linked to the campaign's Google Form
}
```

**Response 201:** `Campaign` (see §4).

### 2.3 `GET /api/campaigns` (v0.1)

List campaigns. Auth: required. Response: `{ items: Campaign[] }`.

### 2.4 `GET /api/campaigns/[id]` (v0.1, extended in v0.2)

Campaign detail with candidate counts. Auth: required.

**Response 200:** `Campaign & { counts_by_stage: { stage: string; count: number }[] }`. The `Campaign` shape gains the v0.2 template + reminder + form-response-sheet fields described in §4.

### 2.5 `POST /api/campaigns/[id]/import` (v0.1, extended in v0.2)

Import candidates from a Google Sheet (ApplicantSync export). Auth: required.

**Request body:**
```ts
{
  google_sheet_url: string;
  column_mapping: ColumnMapping;     // §4 — extended in v0.2 with new optional fields
}
```

**Response 200:** `ImportResult` (`{ imported, skipped, errors }`).

**v0.2 change:** the route now persists `phone`, `current_title`, `current_company`, `school`, `resume_url`, `applicantsync_score`, and `linkedin_data` (JSONB bag of any column the mapping did not consume) when Iris's `fetchSheetRows` surfaces them. Dedupe by email within campaign is unchanged.

### 2.6 `GET /api/candidates` (v0.1, extended in v0.2)

List candidates with filters + pagination. Auth: required.

**Query params:**
- `campaign_id` (uuid, required)
- `stage` (string, optional)
- `page` (default 1), `page_size` (default 50, max 200)
- **v0.2 additions:**
  - `verdict` — `"good_fit" | "not_fit"` (filter by Screen-1 verdict)
  - `interview_verdict` — `"call_interview" | "reject"` (filter by Screen-2 verdict)
  - `candidate_ids` — repeatable param, returns only the listed IDs (used by Fern to refresh selection state after bulk actions)

**Response 200:** `CandidatesListResponse` (§4). Each `Candidate` now includes the v0.2 fields (`phone`, `current_title`, `current_company`, `school`, `resume_url`, `applicantsync_score`, `linkedin_data`, `verdict`, `reason`, `interview_verdict`, `interview_reason`, `stage1_sent_at`, `reminder_sent_at`).

### 2.7 `POST /api/emails/send` (v0.1)

Queue a single Stage-1 email for one candidate. Auth: required. Used for one-off sends; bulk path is §2.10.

**Request body:** `{ candidate_id: Uuid, template_type: "stage1" }`.
**Response 200:** `{ queued: true, idempotency_key: string }`.
**Errors:** `kill_switch_active`, `candidate_not_found`, `validation_error` (no email on file), `already_sent` (today).

### 2.8 `GET /api/campaigns/[id]/export-candidates` (v0.2 NEW)

Download a candidate XLSX for ChatGPT Screen-1 evaluation. Auth: required.

**Response 200:**
- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="candidates-{role_slug}-{yyyymmdd}.xlsx"`
- Body: XLSX binary stream.

**Columns (per REQUIREMENTS_v2.2 §2.2):**

| # | Column | Source |
|---|---|---|
| 1 | `name` | `candidates.full_name` |
| 2 | `email` | `candidates.email` |
| 3 | `linkedin_url` | `candidates.linkedin_url` |
| 4 | `phone` | `candidates.phone` |
| 5 | `current_title` | `candidates.current_title` |
| 6 | `current_company` | `candidates.current_company` |
| 7 | `school` | `candidates.school` |
| 8 | `location` | `candidates.location` |
| 9 | `applicantsync_score` | `candidates.applicantsync_score` |
| 10 | `resume_url` | `candidates.resume_url` |
| 11..N | (per `linkedin_data` key, union across campaign) | `candidates.linkedin_data` |
| N+1 | `verdict` | empty (ChatGPT fills) |
| N+2 | `reason` | empty (ChatGPT fills) |

One row per candidate in the campaign (no stage filter — Sushma evaluates everything that landed).

### 2.9 `POST /api/campaigns/[id]/import-evaluations` (v0.2 NEW)

Re-import an XLSX that ChatGPT filled with verdicts. Auth: required.

**Request:** `multipart/form-data`
- `file` — the XLSX
- `type` — `"screen1" | "screen2"`

**Behavior:**
- Matches rows by `email` (primary) → `linkedin_url` (fallback). Email match is case-insensitive.
- **Screen-1:** writes `verdict` + `reason`; advances stage `imported → evaluated_screen1` (verdict=`good_fit`) or `imported → rejected_screen1` (verdict=`not_fit`). Rows already past `evaluated_screen1` are skipped with reason `wrong_stage`.
- **Screen-2:** writes `interview_verdict` + `interview_reason`; advances `form_submitted → evaluated_screen2` (verdict=`call_interview`) or `form_submitted → rejected_screen2` (verdict=`reject`).
- One audit log entry per updated row.

**Response 200:**
```ts
{
  matched: number;
  updated: number;
  unmatched: Array<{
    row: number;            // 1-indexed XLSX row including header
    email: string | null;
    linkedin_url: string | null;
    reason: "no_match" | "missing_verdict" | "wrong_stage" | "invalid_verdict";
  }>;
}
```

### 2.10 `POST /api/campaigns/[id]/send-bulk` (v0.2 NEW)

Bulk-queue Stage-1 or interview-link emails for N selected candidates. Auth: required.

**Request body:**
```ts
{
  template_type: "stage1" | "interview_link";
  candidate_ids: Uuid[];
}
```

**Per-row preconditions** (`stage1`):
- Candidate's `verdict === "good_fit"`.
- Candidate has an email on file.
- No prior queued/sent `stage1` row for this candidate.
- Candidate stage is `evaluated_screen1`.

**Per-row preconditions** (`interview_link`):
- Candidate's `interview_verdict === "call_interview"`.
- Candidate has an email on file.
- No prior queued/sent `interview_link` row for this candidate.
- Candidate stage is `evaluated_screen2`.

Idempotency key: `bulk:{campaign_id}:{template_type}:{candidate_id}`. Stage transitions happen **only when the cron actually sends** (not on enqueue), so reminder timing keys off real `stage1_sent_at`.

**Response 200:**
```ts
{
  queued: number;
  skipped: Array<{
    candidate_id: Uuid;
    reason: "verdict_not_good_fit"
          | "verdict_not_call_interview"
          | "already_sent"
          | "no_email"
          | "wrong_stage"
          | "candidate_not_found";
  }>;
}
```

Kill switch (`KILL_SWITCH_EMAIL=true`) → 400 `kill_switch_active`.

### 2.11 `POST /api/campaigns/[id]/pull-responses` (v0.2 NEW)

Pull Google Form responses for this campaign from the linked response sheet. Auth: required. Calls Iris's form-response Sheet reader (§5).

**Request body:**
```ts
{
  response_sheet_url?: string;       // optional override; defaults to campaigns.form_response_sheet_url
}
```

If neither the body nor the campaign carries a URL → 400 `validation_error`.

**Behavior:**
- Reads each response row from the sheet.
- Matches respondent to a candidate by email (case-insensitive). Form must ask for email as one of its questions.
- Upserts into `form_responses` (one row per submission). Dedup key: `(candidate_id, submitted_at)`.
- For matched candidates currently in `stage1_sent` or `reminder_sent`, advances stage to `form_submitted` and audits the transition.
- Unmatched responses are returned to the caller but **not** persisted (no orphan rows).

**Response 200:**
```ts
{
  pulled: number;                    // total rows read from sheet
  matched: number;                   // rows that matched a candidate
  unmatched: Array<{
    row: number;
    email: string | null;
    reason: "no_candidate_match" | "missing_email";
  }>;
  deduped: number;                   // already-stored submissions skipped
}
```

### 2.12 `GET /api/campaigns/[id]/export-responses` (v0.2 NEW)

Download an XLSX for ChatGPT Screen-2 evaluation. Auth: required.

**Response 200:** XLSX stream, filename `responses-{role_slug}-{yyyymmdd}.xlsx`.

**Rows:** one per candidate whose stage is in (`form_submitted`, `evaluated_screen2`, `rejected_screen2`, `interview_link_sent`) and who has at least one row in `form_responses`.

**Columns:**

| # | Column | Source |
|---|---|---|
| 1 | `name` | `candidates.full_name` |
| 2 | `email` | `candidates.email` |
| 3 | `linkedin_url` | `candidates.linkedin_url` |
| 4 | `verdict` | `candidates.verdict` (prior Screen-1 verdict, for ChatGPT context) |
| 5 | `reason` | `candidates.reason` (prior Screen-1 rationale) |
| 6..M | (per question key in `form_responses.responses`, union across campaign) | `form_responses.responses[key]` |
| M+1 | `interview_verdict` | empty |
| M+2 | `interview_reason` | empty |

When a candidate has multiple form submissions, the most recent (`submitted_at DESC`) is used.

### 2.13 `GET /api/cron/process-queue` (v0.1, extended in v0.2)

Cron tick. **Auth:** `Authorization: Bearer ${CRON_SECRET}` (no session). Called every 5 min by UptimeRobot.

**Two phases, single tick** (NGO scale; documented in route header):

**Phase 1 — reminder scan (v0.2):** for every campaign, find candidates where
```
stage = 'stage1_sent'
AND stage1_sent_at < now() - INTERVAL (campaigns.reminder_after_days || 3) DAY
AND reminder_sent_at IS NULL
```
Queue one `email_queue` row per candidate with `template_type='reminder'` and idempotency key `reminder:{campaign_id}:{candidate_id}`. Skip if such a key already exists.

**Phase 2 — drain (v0.1 + extended):** claim up to 20 `pending` rows ordered by `scheduled_for ASC`. For each:
- Render the right template (`stage1` / `reminder` / `interview_link`) by reading the per-campaign template strings from `campaigns`.
- Send via `sendEmail` (which still enforces 9–18 IST window + 20/hr cap + kill switch).
- On `sent`: stamp `email_queue.sent_at`, `email_queue.status='sent'`, and on the candidate:
  - `stage1` → set `stage='stage1_sent'`, `stage1_sent_at=now()`
  - `reminder` → set `stage='reminder_sent'`, `reminder_sent_at=now()`
  - `interview_link` → set `stage='interview_link_sent'`
- On `queued: true` (rate-limited / outside window) → push `scheduled_for` forward 15 min, leave `pending`.
- On `error` → retry up to 3× with linear backoff (15/30/45 min), then `failed`.
- 30–60s random delay between sends.

**Response 200:** `{ processed: number, skipped: number, failed: number, reminders_queued: number }`.

---

## 3. Webhook Payloads

No webhooks in v2.1. Gmail SMTP doesn't fire delivery webhooks. Bounce detection is synchronous via Nodemailer SMTP error codes.

---

## 4. Shared TypeScript Types

Published by Basil in `lib/types.ts`. All snake_case to match wire format. Timestamps are ISO 8601 UTC strings.

```ts
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

  // v0.2 additions — per-campaign editable email templates + reminder config + form response sheet
  stage1_subject: string;
  stage1_body: string;
  reminder_subject: string;
  reminder_body: string;
  interview_subject: string;
  interview_body: string;
  reminder_after_days: number;       // default 3
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

  // v0.2 additions — extra ApplicantSync fields
  phone: string | null;
  current_title: string | null;
  current_company: string | null;
  school: string | null;
  resume_url: string | null;
  applicantsync_score: string | null;       // e.g. "9/11" — preserved verbatim, not normalized
  linkedin_data: Record<string, string>;    // see "linkedin_data shape" below; default {}

  // v0.2 additions — ChatGPT verdicts
  verdict: Verdict | null;
  reason: string | null;
  interview_verdict: InterviewVerdict | null;
  interview_reason: string | null;

  // v0.2 additions — reminder timing
  stage1_sent_at: IsoDateTime | null;
  reminder_sent_at: IsoDateTime | null;
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

// v0.2 NEW
export type FormResponse = {
  id: Uuid;
  candidate_id: Uuid;
  campaign_id: Uuid;
  responses: Record<string, string>;        // question text → answer text
  submitted_at: IsoDateTime;
  created_at: IsoDateTime;
};

// --- Imports / requests / responses -------------------------------------

export type ColumnMapping = {
  full_name: string;
  role?: string;
  email?: string;
  linkedin_url?: string;
  headline?: string;
  location?: string;
  application_date?: string;

  // v0.2 additions — mirrors Iris's extended SheetRow
  phone?: string;
  current_title?: string;
  current_company?: string;
  school?: string;
  resume_url?: string;
  applicantsync_score?: string;
};

export type ImportError = { row: number; reason: string };
export type ImportResult = { imported: number; skipped: number; errors: ImportError[] };

export type CandidatesListResponse = {
  items: Candidate[];
  total: number;
  page: number;
  page_size: number;
};

// v0.2 NEW

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

export type PullResponsesResult = {
  pulled: number;
  matched: number;
  unmatched: Array<{
    row: number;
    email: string | null;
    reason: "no_candidate_match" | "missing_email";
  }>;
  deduped: number;
};

export type ApiError = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};
```

### `linkedin_data` shape (locked, 2026-05-20)

JSONB column on `candidates`. Storage shape: **`Record<string, string>`**, defaulting to `{}` (never `null`) so SQL projections + UI rendering stay branchless.

- **Keys:** sheet header strings verbatim — no slugification, no lowercasing, no whitespace trimming beyond what Google Sheets returns. If two headers collide (post-Google-normalization) Iris's `fetchSheetRows` resolves the conflict; we store whatever it surfaces.
- **Values:** the raw cell string, with trailing whitespace trimmed.
- **What goes in:** only columns that are **not** consumed as named ApplicantSync fields. The set of named fields is: `full_name`, `email`, `phone`, `current_title`, `current_company`, `school`, `location`, `linkedin_url`, `application_date`, `applicantsync_score`, `resume_url` (plus the `headline` field already in v0.1). Everything else (LinkedIn screening Q answers, custom recruiter columns, status flags, etc.) lands in `linkedin_data`.
- **For a job with no custom screening Qs:** `linkedin_data = {}`.

### Stage IDs (seeded values)

| Stage ID | Position | Label | Added in |
|---|---|---|---|
| `imported` | 1 | Imported | v0.1 |
| `good_fit` | 2 | Good Fit (deprecated by v2.2 — see `evaluated_screen1`) | v0.1 |
| `stage1_sent` | 3 | Stage-1 Form Sent | v0.1 |
| `form_submitted` | 4 | Form Submitted | v0.1 |
| `evaluated` | 5 | Evaluated (deprecated by v2.2 — see `evaluated_screen2`) | v0.1 |
| `reminder_sent` | 6 | Reminder Sent | v0.1 (semantic refined in v0.2) |
| `stage2_sent` | 7 | Stage-2 Invite Sent (deprecated by v2.2 — see `interview_link_sent`) | v0.1 |
| `confirmed` | 8 | Confirmed | v0.1 |
| `rejected` | 9 | Rejected (legacy — replaced by `rejected_screen1` / `rejected_screen2`) | v0.1 |
| `evaluated_screen1` | 10 | Evaluated — Screen 1 (good fit) | v0.2 |
| `rejected_screen1` | 11 | Rejected — Screen 1 (not fit) | v0.2 |
| `evaluated_screen2` | 12 | Evaluated — Screen 2 (call for interview) | v0.2 |
| `rejected_screen2` | 13 | Rejected — Screen 2 | v0.2 |
| `interview_link_sent` | 14 | Interview Link Sent | v0.2 |

v0.1 stages are kept in the seed for backward compatibility but the active v0.2 stage machine is the one in REQUIREMENTS_v2.2 §6. New code should not write `good_fit`, `evaluated`, `stage2_sent`, or `rejected` — use the screen1/screen2 variants instead.

---

## 5. Internal Library Signatures

### `lib/sheets/fetchRows.ts` (v0.1, extended in v0.2, Integrations)

Published by Iris 2026-04-17, extended 2026-05-20.

```ts
import type { ColumnMapping } from "@/lib/types";

// v0.2: SheetRow gains 6 typed fields (phone, current_title, current_company,
// school, resume_url, applicantsync_score). Existing fields stay. raw still
// captures every column (incl. ApplicantSync "Status" + any LinkedIn
// screening-Q answers → feeds Basil's linkedin_data JSONB).
export type SheetRow = {
  row_number: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;                  // NEW — ApplicantSync "Phone"
  linkedin_url: string | null;
  role: string | null;                   // existing — multi-role sheets; null for ApplicantSync
  headline: string | null;               // existing — usually null for ApplicantSync
  current_title: string | null;          // NEW — ApplicantSync "Title"
  current_company: string | null;        // NEW — ApplicantSync "Company"
  school: string | null;                 // NEW
  location: string | null;
  application_date: string | null;       // existing — ApplicantSync "Applied Date"
  resume_url: string | null;             // NEW
  applicantsync_score: string | null;    // NEW — preserved as string (e.g. "9/11")
  raw: Record<string, string>;
};

export type SheetFetchError = { row: number; reason: string };

export type FetchSheetRowsResult = {
  rows: SheetRow[];
  errors: SheetFetchError[];
  header_row: string[];
  sheet_title: string;
};

export class SheetUnreachableError extends Error {}
export class SheetUpstreamError extends Error {}

export async function fetchSheetRows(args: {
  url: string;
  mapping: ColumnMapping;
  batchSize?: number;           // default 100
}): Promise<FetchSheetRowsResult>;

export function suggestMapping(headers: string[]): Partial<ColumnMapping>;

// v0.2 notes:
// - suggestMapping / fetchSheetRows function signatures unchanged.
// - Iris drops "title" + "job title" from role aliases; both routed to current_title.
// - ApplicantSync "Status" column stays in raw (not lifted to a typed field).
```

Error semantics: sheet-level failures throw `SheetUnreachableError` (bad URL, missing sharing, env missing) or `SheetUpstreamError` (transient Google API error). Row-level issues go into `errors` array. Also exports `parseSheetUrl(url): { spreadsheetId, gid }` from `lib/sheets/client.ts`.

### `lib/nodemailer/transport.ts` (v0.1, Integrations)

Published by Iris 2026-04-17.

```ts
import type { Transporter } from "nodemailer";

export function getTransport(): Transporter;
export function getSenderAddress(): string;   // '"Sender Name" <user@gmail.com>'
export async function verifyConnection(): Promise<boolean>;
```

Uses `GMAIL_USER` + `GMAIL_APP_PASSWORD` + `GMAIL_SENDER_NAME` env vars. Transport is cached after first call. `verifyConnection()` returns `false` on SMTP auth failure (safe for health checks). Basil's `lib/email/sender.ts` imports `getTransport()` and `getSenderAddress()` to dispatch emails.

### `lib/email/sender.ts` (v0.1, Backend)

Published by Basil 2026-04-28.

```ts
export type SendResult =
  | { sent: true; messageId: string }
  | { sent: false; queued: true; reason: string }     // rate-limited / outside window / kill switch
  | { sent: false; queued: false; error: string };    // hard failure

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult>;
```

Enforces `KILL_SWITCH_EMAIL`, the 9–18 IST window, and the hourly cap (default 20) by reading `email_queue.sent_at` for the last hour. Caller is responsible for marking the queue row.

### `lib/email/templates.ts` (v0.1, Backend — extended in v0.2)

Published by Basil. Template strings live on the `campaigns` row in v0.2; these functions take the campaign row + candidate row and do `{{merge_field}}` substitution.

```ts
import type { CandidateRow, CampaignRow } from "@/db/schema";

export type RenderedEmail = { subject: string; html: string; text: string };

// Stage-1 Google Form invite. Merge fields: {{name}}, {{form_link}}, {{deadline}}.
export function renderStage1(
  candidate: CandidateRow,
  campaign: CampaignRow,
  opts?: { deadline?: string }
): RenderedEmail;

// Reminder for non-responders. Same merge fields as Stage-1.
export function renderReminder(
  candidate: CandidateRow,
  campaign: CampaignRow,
  opts?: { deadline?: string }
): RenderedEmail;

// Interview link. Merge fields:
//   {{name}}, {{interview_date}}, {{interview_time}},
//   {{zoom_link}}, {{zoom_meeting_id}}, {{zoom_passcode}}.
// (No {{hrbp_note}} — HRBP customizes the entire body at campaign creation time.)
export function renderInterviewLink(
  candidate: CandidateRow,
  campaign: CampaignRow
): RenderedEmail;
```

Defaults are seeded into `campaigns.{stage1_subject,stage1_body,reminder_subject,reminder_body,interview_subject,interview_body}` from constants in `lib/email/defaults.ts` so new campaigns work without HR filling all 6 template fields.

### `lib/sheets/formResponses.ts` (v0.2, Integrations)

Published by Iris 2026-05-20.

```ts
import type { SheetFetchError } from "./fetchRows";
export { SheetUnreachableError, SheetUpstreamError } from "./fetchRows";  // reused

export type FormResponse = {
  row_number: number;
  submitted_at: string | null;       // ISO 8601 UTC; null if Forms timestamp unparseable
  submitted_at_raw: string;          // raw Forms cell, e.g. "5/19/2026 16:36:42"
  email: string | null;              // lowercased, trimmed; null if blank/missing column
  answers: Record<string, string>;   // header → answer, excluding Timestamp + email column
  raw: Record<string, string>;       // every column (incl. Timestamp + email) untouched
};

export type FetchFormResponsesResult = {
  responses: FormResponse[];
  errors: SheetFetchError[];
  header_row: string[];
  email_header: string | null;       // which header we used for email, for UI/debug
  sheet_title: string;
};

export async function fetchFormResponses(args: {
  url: string;
  emailQuestionHeader?: string;      // default "Email Address" (case-insensitive);
                                     //   also tries "Email", "Email address", "E-mail"
}): Promise<FetchFormResponsesResult>;
```

Same auth + `parseSheetUrl` from `client.ts`. Same throw model as `fetchSheetRows`: sheet-level (`SheetUnreachableError` / `SheetUpstreamError`); row-level into `errors`.

**Naming reconciliation:** the wire/DB type `FormResponse` in §4 (with fields `id`, `candidate_id`, `campaign_id`, `responses`, `submitted_at`, `created_at`) is the persisted form-responses row. Iris's `FormResponse` here is the in-flight row shape returned by the sheet reader — same name, different module. Basil's `pull-responses` route maps from the sheet shape (`{row_number, submitted_at, email, answers, raw}`) onto the persisted shape (`{candidate_id, campaign_id, responses: answers, submitted_at}`). If the dual-name causes confusion downstream, we'll rename the sheet-reader type to `FormResponseRow` in a follow-up patch.

### ~~`lib/evaluation/engine.ts`~~ (CUT in v2.2 pivot)

The AI evaluation engine (Tier 1 / Tier 2 scoring, PASS/FAIL/REVIEW) is **out of scope**. Sushma evaluates candidates manually in ChatGPT via the XLSX round-trip (§2.8 + §2.9 + §2.12 endpoints). See REQUIREMENTS_v2.2 §3.

### ~~`lib/gmail/replyDetector.ts`~~ (DEFERRED past v0.2)

Reply detection was v0.3 in the old plan — deferred until a new hire joins. See REQUIREMENTS_v2.2 §3.

### ~~`lib/sheets/trackerSheet.ts`~~ (DEFERRED past v0.2)

Tracker sheet auto-sync was v0.4 in the old plan — deferred. See REQUIREMENTS_v2.2 §3.

---

## 6. Amendment Rule

Any change to a published endpoint, type, env var, or signature requires a note in `PROGRESS.md` → Blockers before the change is merged.
