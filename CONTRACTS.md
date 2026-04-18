# CONTRACTS — Shared interfaces between agents (v2.1)

Authoritative contract between Backend, Frontend, and Integrations agents. Anything here can be relied on; anything not here does not yet exist. Backend is the primary author for API endpoints; Integrations owns external service env vars and library signatures. Frontend never invents — it only consumes.

Last updated: 2026-04-17 (reset for PRD v2.1 pivot)

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

_To be published by Basil at start of v0.1._

### Response conventions

- **Success**: documented payload directly (no wrapper).
- **Error**: `{ error: { code: string, message: string, details?: Record<string, unknown> } }`.
- **Timestamps**: ISO 8601 UTC. **IDs**: UUID v4.

---

## 3. Webhook Payloads

No webhooks in v2.1. Gmail SMTP doesn't fire delivery webhooks. Bounce detection is synchronous via Nodemailer SMTP error codes.

---

## 4. Shared TypeScript Types

_To be published by Basil in `lib/types.ts` at start of v0.1._

---

## 5. Internal Library Signatures

### `lib/sheets/fetchRows.ts` (v0.1, Integrations)

Published by Iris 2026-04-17.

```ts
import type { ColumnMapping } from "@/lib/types";

export type SheetRow = {
  row_number: number;
  full_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  role: string | null;
  headline: string | null;
  location: string | null;
  application_date: string | null;
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

_To be published by Basil._

### `lib/email/templates.ts` (v0.1, Backend)

_To be published by Basil. Must include the 3 real templates from PRD v2.1 §6.2._

### `lib/evaluation/engine.ts` (v0.2, Backend)

_To be published by Basil._

### `lib/gmail/replyDetector.ts` (v0.3, Integrations)

_To be published by Iris._

### `lib/sheets/trackerSheet.ts` (v0.4, Integrations)

_To be published by Iris._

---

## 6. Amendment Rule

Any change to a published endpoint, type, env var, or signature requires a note in `PROGRESS.md` → Blockers before the change is merged.
