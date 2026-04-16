# CONTRACTS — Shared interfaces between agents

This file is the **authoritative contract** between the Backend, Frontend, and Integrations agents. Anything in here can be relied on; anything not in here does not yet exist. Backend agent is the primary author for API endpoints; Integrations agent owns external service env vars and payload shapes. Frontend agent never invents — it only consumes.

Last updated: 2026-04-16 (Backend agent: v0.1 Candidates contracts + shared types + fetchSheetRows signature)

---

## 1. Environment Variables

| Name | Required for version | Owner | Purpose |
|---|---|---|---|
| `DATABASE_URL` | v0.1+ | Orchestrator | Neon Postgres connection string |
| `NEXTAUTH_SECRET` | v0.1+ | Orchestrator | NextAuth JWT signing secret (32+ random bytes) |
| `NEXTAUTH_URL` | v0.1+ | Orchestrator | Public URL of the app |
| `ADMIN_EMAIL` | v0.1+ | Orchestrator | Single admin user for v1 |
| `ADMIN_PASSWORD_HASH` | v0.1+ | Orchestrator | bcrypt hash of the admin password |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | v0.1+ | Integrations | Service account email with Sheets API access |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | v0.1+ | Integrations | PEM private key for the service account |
| `KILL_SWITCH_EMAIL` | v0.4+ | Backend | If `true`, email subsystem refuses to send anything |
| `RESEND_API_KEY` | v0.4+ | Integrations | Resend API key |
| `RESEND_WEBHOOK_SECRET` | v0.4+ | Integrations | Resend webhook signing secret |
| `RESEND_FROM_EMAIL` | v0.4+ | Integrations | Verified sender address |
| `SENDING_WINDOW_START_IST` | v0.4+ | Backend | Hour, e.g. 9 |
| `SENDING_WINDOW_END_IST` | v0.4+ | Backend | Hour, e.g. 18 |
| `DAILY_SEND_CAP` | v0.4+ | Backend | Max emails per UTC day |
| `SEND_DELAY_MIN_SECONDS` | v0.4+ | Backend | Random delay lower bound |
| `SEND_DELAY_MAX_SECONDS` | v0.4+ | Backend | Random delay upper bound |
| `SNOV_API_USER_ID` | v0.5+ | Integrations | Snov.io API user id |
| `SNOV_API_SECRET` | v0.5+ | Integrations | Snov.io API secret |
| `APOLLO_API_KEY` | v0.5+ | Integrations | Apollo.io fallback |
| `CRON_SECRET` | v0.6+ | Backend | Header token to authenticate Vercel Cron calls |
| `ADMIN_ALERT_EMAIL` | v0.7+ | Backend | Where bounce-rate and uptime alerts go |

Every new version adds to the bottom of this table and to `.env.example` in the same PR.

---

## 2. API Endpoints

Format: method + path + purpose + request + response + auth. All JSON unless noted. All mutating endpoints write to `audit_log`.

### Authentication
Provided by NextAuth v5 at `/api/auth/[...nextauth]`. Standard NextAuth endpoints, not listed here. Unauthenticated requests to any `/api/*` endpoint except `/api/auth/*` and `/api/webhooks/*` receive a `401` with body `{ error: { code: "unauthorized", message: "Sign-in required" } }`.

### Response conventions (v0.1)

- **Success envelope** — endpoints return the documented success payload directly (no wrapper). This keeps shapes easy to consume from TanStack Query.
- **Error envelope** — on `4xx`/`5xx` the body is `{ error: { code: string, message: string, details?: Record<string, unknown> } }`. `code` is a machine-readable tag (`unauthorized`, `validation_error`, `not_found`, `sheet_unreachable`, `campaign_not_found`, `internal_error`). `message` is a human-readable one-liner the UI can show in a Toast.
- **Timestamps** — ISO 8601 UTC strings (e.g. `"2026-04-16T09:14:02.311Z"`).
- **IDs** — UUID v4 strings.
- **Pagination** — page-based via `page` (1-indexed) + `page_size`. Cursor pagination may be introduced in v0.2+ without breaking existing callers.

### Candidates (v0.1)

**`Candidate` type** (returned by all candidate endpoints):

```ts
type Candidate = {
  id: string;                    // uuid v4
  full_name: string;
  email: string | null;          // nullable until enriched
  linkedin_url: string | null;
  role: string;
  campaign_id: string;           // uuid v4
  stage: string;                 // stages.id (e.g. "new", "stage1_sent")
  email_enriched: boolean;       // true if Snov.io filled in the email
  notes: string | null;
  created_at: string;            // ISO 8601 UTC
  updated_at: string;            // ISO 8601 UTC
};
```

**GET `/api/candidates`** — list candidates · auth: required
- Query params (all optional):
  - `campaign_id` — uuid; filter to one campaign. If omitted, returns candidates across all campaigns.
  - `stage` — stages.id string, e.g. `new`.
  - `role` — exact match against `candidates.role`.
  - `has_email` — `true` → only rows where `email IS NOT NULL`; `false` → only rows where `email IS NULL`.
  - `date_from`, `date_to` — ISO 8601; filters on `created_at`.
  - `page` — 1-indexed integer, default `1`.
  - `page_size` — integer, default `50`, max `200`. Values over `200` are clamped.
- Sort order: `created_at DESC, id DESC` (stable).
- Response `200`:
  ```json
  {
    "items": [Candidate, ...],
    "total": 123,
    "page": 1,
    "page_size": 50
  }
  ```
- Response `400` on malformed query params (e.g. invalid uuid, non-numeric `page`). Uses the error envelope.

**POST `/api/candidates/import`** — import from Google Sheet · auth: required
- Body:
  ```ts
  {
    google_sheet_url: string;   // full sheets.google.com URL; any gid is accepted
    campaign_id: string;        // uuid of an existing campaign (must exist)
    column_mapping: {
      full_name: string;        // header text in row 1 of the sheet
      role: string;             // header text in row 1 of the sheet
      email?: string;           // optional — omit if the sheet has no email column
      linkedin_url?: string;    // optional
    };
  }
  ```
- Behaviour:
  - The endpoint calls `fetchSheetRows` from `lib/sheets/fetchRows.ts` (Integrations-owned; signature in §5).
  - Rows missing `full_name` or `role` are skipped and reported in `errors`.
  - Rows where `email` already exists on another candidate within the same `campaign_id` are skipped (duplicate) and reported in `errors`.
  - `google_sheet_row` is set to the 1-indexed row number in the source sheet so v0.7 two-way sync can write back.
  - Each imported candidate defaults to `stage = "new"`, `email_enriched = false`.
  - One `audit_log` row is written per successful import batch with `action = "candidates.imported"` and a per-row summary in `metadata`.
- Response `200`:
  ```json
  {
    "imported": 47,
    "skipped": 3,
    "errors": [
      { "row": 12, "reason": "missing full_name" },
      { "row": 29, "reason": "duplicate email in campaign" }
    ]
  }
  ```
- Response `400` — error envelope, codes: `validation_error` (bad body), `campaign_not_found` (unknown `campaign_id`), `sheet_unreachable` (Google Sheets returned an error the service account could not resolve — likely sharing permissions).
- Response `502` — error envelope, code: `sheet_upstream_error` if Sheets API throws a transient error.

### Stages (v0.2)

_To be published by Backend agent at start of v0.2._

### Stage transitions (v0.3)

_To be published by Backend agent at start of v0.3._

### Emails (v0.4)

_To be published by Backend agent at start of v0.4._

### Enrichment (v0.5)

_To be published by Backend agent at start of v0.5._

### Bulk and Cron (v0.6)

_To be published by Backend agent at start of v0.6._

### Compliance (v0.7)

_To be published by Backend agent at start of v0.7._

---

## 3. Webhook Payloads

### Resend (v0.4)

_To be published by Integrations agent at start of v0.4. Must include: event types handled (`email.sent`, `email.delivered`, `email.bounced`, `email.opened`, `email.complained`), expected headers (including signature header), verification algorithm, and how each event maps to `email_events.status`._

---

## 4. Shared TypeScript Types

Exported from `lib/types.ts`. Authored by Backend agent; consumed by Frontend and Integrations.

v0.1 shapes (authoritative):

```ts
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

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
```

---

## 5. Internal Library Signatures

### `lib/sheets/fetchRows.ts` (v0.1, Integrations)

Proposed by Backend 2026-04-16 to unblock the import route. Integrations owns the implementation and may widen the return type, but must not narrow the input or remove fields from the error/row shapes below without a `Blockers / Decisions Needed` note.

```ts
import type { ColumnMapping } from "@/lib/types";

export type SheetRow = {
  row_number: number;           // 1-indexed row in the source sheet (header is row 1)
  full_name: string | null;     // trimmed; null if the cell was empty
  email: string | null;
  linkedin_url: string | null;
  role: string | null;
  raw: Record<string, string>;  // full header→cell map for the row, for audit/debug
};

export type SheetFetchError = { row: number; reason: string };

export type FetchSheetRowsResult = {
  rows: SheetRow[];
  errors: SheetFetchError[];    // malformed rows, collected not thrown
  header_row: string[];         // raw header cells in sheet order
  sheet_title: string;          // for audit_log metadata
};

export async function fetchSheetRows(args: {
  url: string;
  mapping: ColumnMapping;
  batchSize?: number;           // default 100
}): Promise<FetchSheetRowsResult>;
```

Error semantics: if the sheet is unreachable (bad URL, service account not shared on the sheet, API quota, etc.) the function throws. The Backend import route translates thrown errors into `sheet_unreachable` / `sheet_upstream_error` response codes per §2. Row-level malformed data is never thrown — it is returned in `errors`.

### `lib/email/sender.ts` (v0.4, Backend)

_Signature to be published by Backend agent before Integrations wires Resend._

### `lib/email/templates.ts` (v0.4, Integrations)

_Signature to be published by Integrations agent before Backend wires the send endpoint._

### `lib/enrichment/client.ts` (v0.5, Integrations)

_Signature to be published by Integrations agent before Backend wires the enrich endpoint._

---

## 6. Amendment Rule

Any change to an already-published endpoint, payload, env var, or exported type requires a note in `PROGRESS.md` under "Blockers / Decisions Needed" with the rationale, before the change is merged.
