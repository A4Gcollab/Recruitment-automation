# A4G Impact Collaborative — Recruitment Automation Platform
## Product Requirements Document v1.0

**Company:** A4G Impact Collaborative / Omysha Foundation  
**Author:** Engineering & Product Team  
**Status:** Ready for Development  
**Date:** April 2026  
**Builder profile:** Solo developer, Python- and JS-comfortable, zero recurring cost target

---

## 1. Executive Summary

A4G currently runs its entire recruitment pipeline — candidate screening, form dispatch, evaluation, and interview scheduling — through manual LinkedIn messaging and spreadsheet tracking. This approach takes 3–5 hours of HR time per job posting, produces no audit trail, and cannot scale. Following the discovery that LinkedIn DM automation via the unofficial Voyager API violates TOS Section 8.2 and carries a ~23% account restriction rate within 90 days (LinkedIn detection systems improved 340% since 2023, with Proxycurl sued and shut down in 2025), this platform pivots to email as the primary outreach channel. Candidate emails are already in the Google Sheet. This PRD specifies a full-stack, zero-recurring-cost recruitment automation platform: a Next.js 15 web application with a Kanban pipeline view, automated email dispatch, Google Sheets ingestion, Postgres-backed candidate tracking, and a safety layer that prevents account-level risks entirely.

---

## 2. Goals and Non-Goals

### Goals

- Import candidates from an existing Google Sheet into a Postgres database that becomes the authoritative source of truth
- Send stage-based recruitment emails (Stage-1 screening form, Stage-2 interview invite, rejection, follow-up reminder) with templating, variable substitution, and delivery tracking
- Provide a Kanban board UI to visualise and drag-drop candidates across pipeline stages
- Track email delivery events (sent, delivered, bounced, opened, replied) via webhook
- Enrich missing candidate emails from LinkedIn profile URLs using a legitimate, API-based lookup service — no browser-session scraping
- Enforce a safety layer: send windows, daily caps, randomised delays, dry-run mode, kill switch
- Achieve zero recurring infrastructure cost at A4G's volume (under 100 candidates per hiring cycle)

### Non-Goals (v1)

- LinkedIn DM or InMail automation of any kind
- Reply parsing via IMAP or inbox reading
- AI-drafted follow-up messages
- SMS or WhatsApp outreach
- Calendar booking or interview slot scheduling
- Multi-user roles or team accounts
- Slack notifications
- Mobile app

---

## 3. User Personas and Primary User Stories

**Suhani Jain — HR Lead (Primary User)**

Suhani runs 2–4 hiring campaigns per year, each with 50–200 LinkedIn applicants. She spends several hours per campaign on manual outreach. She is non-technical but comfortable with spreadsheets, LinkedIn Recruiter, and Google Forms.

User stories:

- As Suhani, I want to import this week's applicants from my Google Sheet in one click so I don't have to re-enter data
- As Suhani, I want to see all candidates in a Kanban board so I can understand the pipeline state at a glance
- As Suhani, I want to drag a candidate card to a new column and have the appropriate email sent automatically
- As Suhani, I want to confirm before any bulk email send so I never accidentally message the wrong people
- As Suhani, I want to see which candidates opened my email and who hasn't replied after 20 hours
- As Suhani, I want to enrich a missing email address from a LinkedIn URL without risking the LinkedIn account

**Engineering / Admin (Secondary User)**

Sets up the system, manages credentials, monitors for errors, adjusts templates and criteria.

User stories:

- As the developer, I want a dry-run mode so I can test email sends without reaching real candidates
- As the developer, I want a kill switch environment variable that halts all outbound email instantly
- As the developer, I want webhook-based delivery event ingestion so I know when emails bounce

---

## 4. System Architecture

```
Google Sheet
     │
     │  (google-spreadsheet npm / Sheets REST API)
     ▼
Import Job (Next.js Route Handler)
     │
     ▼
PostgreSQL on Neon ◄──────────────────────────────────┐
     │                                                  │
     │                                                  │
     ├─── Next.js API Routes ────────────────────────►  Candidate Tracker
     │         │                                     (Google Sheet two-way sync)
     │         │
     │    ┌────┴────────────────────────────────────┐
     │    │  Kanban UI (Next.js App Router + React)  │
     │    │  shadcn/ui + @dnd-kit + TanStack Query  │
     │    └─────────────────────────────────────────┘
     │
     ├─── Send Dispatcher (safety layer: delay, cap, window check)
     │         │
     │         ▼
     │    Resend API ────► Candidate inbox
     │         │
     │         ▼ (webhook)
     └─── /api/webhooks/resend ──► email_events table
```

The architecture is a single Next.js 15 monorepo hosted on Vercel. There is no separate backend service. All business logic lives in Next.js Route Handlers. Postgres on Neon is the authoritative data store. The Google Sheet is an ingest surface and optional two-way sync output, not a database. Vercel Cron drives scheduled and delayed sends via a scheduled_sends table. Resend handles email delivery and fires webhooks back to the application for delivery events.

---

## 5. Tech Stack Decisions

| Component | Chosen Tool | Free-Tier Limit | Rationale | Switch Path if Needed |
|---|---|---|---|---|
| Framework | Next.js 15 App Router + TypeScript | Free (open source) | Locked by requirement. Full-stack in one repo, server components, route handlers, cron support on Vercel. | N/A — locked |
| Styling | Tailwind CSS + shadcn/ui | Free (open source) | Locked by requirement. shadcn/ui gives production-quality components with zero vendor lock-in — copy-pasted into the repo. | N/A — locked |
| Database | Neon (serverless Postgres) | Free tier: 0.5 GB storage, 190 compute hours/month, scale-to-zero, 1 project | Neon wins for this use case. It has a native Vercel integration, scale-to-zero means zero cost when idle between campaigns, instant database branching for safe testing, and the Databricks acquisition gives it long-term backing. Supabase's free tier pauses after 1 week of inactivity which would break cron jobs and webhook ingestion during quiet periods. Supabase's bundled auth, storage, and realtime are unused features that add complexity. | Upgrade to Neon Launch ($19/month) at >190 compute hours; or migrate to Supabase Pro ($25/month) if realtime subscriptions become needed |
| ORM | Drizzle ORM | Free (open source) | Drizzle runs within 10–20% of raw SQL performance vs Prisma's historical 2–4x overhead. Prisma 7 closed the gap significantly, but Drizzle's ~7.4 KB bundle, zero codegen step, and native Vercel Edge compatibility make it the better fit for a serverless Vercel deployment by a solo developer. The SQL-like TypeScript API is immediately readable for a JS/Python developer. Drizzle's strict migration mode prevents data loss from accidental renames. | Switch to Prisma if team grows and schema abstraction matters more than bundle size |
| Email sending | Resend (primary) | 3,000 emails/month free, 100/day free sub-limit, React Email templates | Resend is purpose-built for Next.js, has the cleanest developer experience in the ecosystem, React Email component templates, excellent webhook support, and its 3,000/month free tier covers ~30 full hiring cycles at 100 candidates each. Brevo's 300/day (9,000/month) limit is more generous in total volume but its transactional API is slower and its developer experience is marketing-first rather than developer-first. For A4G's use case (under 100 candidates/cycle, infrequent sends), Resend is the better fit. | Switch to Brevo if monthly volume exceeds 3,000: update RESEND_API_KEY to BREVO_API_KEY, swap the resend npm package for the @getbrevo/brevo SDK, update webhook endpoint handler. All email logic is isolated in lib/email/sender.ts. |
| Drag and drop | @dnd-kit/core + @dnd-kit/sortable | Free (open source) | @dnd-kit is actively maintained, modular, tree-shakeable, and has first-class Next.js + shadcn/ui integration examples with thousands of production deployments. @hello-pangea/dnd is simpler for pure list-based boards but is a community fork of the deprecated react-beautiful-dnd — it provides less fine-grained collision detection control and lacks @dnd-kit's accessibility customisation depth. For a multi-column Kanban with custom card rendering and optimistic updates, @dnd-kit is the stronger choice. | N/A — both are open source, migration between them is a component rewrite |
| Background jobs | Vercel Cron + scheduled_sends table | Free on Vercel Hobby (1 cron job; minimum 1-hour interval on Hobby, 1-minute on Pro) | Vercel Hobby allows one cron job. The scheduled_sends table pattern works within this constraint: all sends are queued to the table, and the single cron job fires every hour to process due rows. If more granular scheduling is needed, upgrade to Vercel Pro ($20/month) for per-minute crons. | Upgrade to Vercel Pro for per-minute cron; or migrate to Trigger.dev free tier (open-source background jobs) |
| Auth | NextAuth v5 (Auth.js) | Free (open source) | For v1 with a single admin user, NextAuth is the correct choice. Clerk's 10,000 MAU free tier is generous but introduces vendor lock-in and an external dependency for a tool that only needs one login. NextAuth v5 with the credentials provider, a bcrypt-hashed password stored as an environment variable, and a JWT session is a 30-minute setup with zero ongoing cost and zero external services. Better Auth is technically superior but adds complexity that is not justified for one user. | Migrate to Clerk if multi-user support or social login is needed in v2 — the NextAuth → Clerk migration is well-documented |
| Hosting | Vercel Hobby | Free for personal/non-commercial projects | Single command deploy, automatic preview deployments, native Next.js support, free SSL, Neon integration. | Upgrade to Vercel Pro ($20/month) if team size, concurrent builds, or cron granularity requires it |
| Google Sheets | google-spreadsheet npm (v4) | Free (Google Sheets API quota: 300 requests/minute per project) | Simple, well-maintained wrapper around Sheets REST API v4. Handles OAuth and service account auth cleanly. | Switch to raw fetch calls against Sheets REST API if the npm package causes issues — no vendor lock-in |
| Email enrichment | Snov.io (primary) | 50 credits/month free | See Section 9 for full comparison. | Switch to Apollo.io if Snov.io credits run out |
| Monitoring | UptimeRobot | Free tier: 50 monitors, 5-minute checks | Monitors the /api/health endpoint. Sends email alert if the app goes down. | N/A — free forever at this tier |

---

## 6. Data Model

### Table: candidates

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PRIMARY KEY, default gen_random_uuid() | Internal identifier |
| full_name | varchar(255) | NOT NULL | From Google Sheet |
| email | varchar(320) | NULLABLE, UNIQUE when non-null | Primary contact; may be enriched |
| linkedin_url | varchar(500) | NULLABLE | Used for email enrichment |
| role | varchar(255) | NOT NULL | e.g. HR Intern, Social Psychology Intern |
| campaign_id | uuid | NOT NULL, FK → campaigns.id | Which hiring cycle |
| stage | varchar(100) | NOT NULL, DEFAULT 'new' | Current Kanban column |
| email_enriched | boolean | NOT NULL, DEFAULT false | Whether email was sourced via enrichment |
| google_sheet_row | integer | NULLABLE | Row reference for two-way sync |
| notes | text | NULLABLE | HR manual notes |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Import timestamp |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | Last modified |

Index on campaign_id. Index on stage. Unique partial index on email WHERE email IS NOT NULL.

### Table: campaigns

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PRIMARY KEY | |
| role_name | varchar(255) | NOT NULL | e.g. HR Intern |
| google_sheet_url | text | NULLABLE | Source sheet for this campaign |
| google_form_link | text | NULLABLE | Stage-1 form URL |
| zoom_link | text | NULLABLE | Interview meeting link |
| zoom_meeting_id | varchar(50) | NULLABLE | |
| zoom_passcode | varchar(50) | NULLABLE | |
| interview_date | varchar(100) | NULLABLE | e.g. Friday, 3rd April 2026 |
| interview_time | varchar(50) | NULLABLE | e.g. 3:00 PM IST |
| interview_mode | varchar(50) | NULLABLE | e.g. Zoom |
| status | varchar(50) | NOT NULL, DEFAULT 'active' | active, paused, closed |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

### Table: email_templates

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PRIMARY KEY | |
| name | varchar(255) | NOT NULL, UNIQUE | e.g. stage1_form_link |
| stage | varchar(100) | NOT NULL | Which stage this fires at |
| subject | varchar(500) | NOT NULL | Supports {variables} |
| body_html | text | NOT NULL | HTML version, supports {variables} |
| body_text | text | NOT NULL | Plain-text fallback, supports {variables} |
| is_active | boolean | NOT NULL, DEFAULT true | Kill switch per template |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

### Table: email_events

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PRIMARY KEY | |
| candidate_id | uuid | NOT NULL, FK → candidates.id | |
| campaign_id | uuid | NOT NULL, FK → campaigns.id | |
| template_id | uuid | NOT NULL, FK → email_templates.id | |
| resend_message_id | varchar(255) | NULLABLE, UNIQUE | Resend's internal message ID |
| idempotency_key | varchar(255) | NOT NULL, UNIQUE | Prevents duplicate sends |
| status | varchar(50) | NOT NULL, DEFAULT 'queued' | queued, sent, delivered, bounced, opened, complained |
| sent_at | timestamptz | NULLABLE | |
| delivered_at | timestamptz | NULLABLE | |
| opened_at | timestamptz | NULLABLE | First open timestamp |
| bounced_at | timestamptz | NULLABLE | |
| error_message | text | NULLABLE | If send failed |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

Index on candidate_id. Index on status. Index on idempotency_key.

### Table: scheduled_sends

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PRIMARY KEY | |
| candidate_id | uuid | NOT NULL, FK → candidates.id | |
| campaign_id | uuid | NOT NULL, FK → campaigns.id | |
| template_id | uuid | NOT NULL, FK → email_templates.id | |
| scheduled_for | timestamptz | NOT NULL | When to send |
| status | varchar(50) | NOT NULL, DEFAULT 'pending' | pending, processing, done, failed, cancelled |
| retry_count | integer | NOT NULL, DEFAULT 0 | |
| idempotency_key | varchar(255) | NOT NULL, UNIQUE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

Index on scheduled_for WHERE status = 'pending'. This filtered index is what the cron query hits.

### Table: stages

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | varchar(100) | PRIMARY KEY | e.g. new, stage1_sent, stage1_submitted |
| label | varchar(255) | NOT NULL | Display name on Kanban |
| position | integer | NOT NULL | Column order |
| triggers_email | boolean | NOT NULL, DEFAULT false | Whether moving here fires an email |
| template_id | uuid | NULLABLE, FK → email_templates.id | Which template fires on entry |

Seeded at migration time with the nine pipeline stages.

### Table: audit_log

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PRIMARY KEY | |
| actor | varchar(255) | NOT NULL | admin or system |
| action | varchar(255) | NOT NULL | e.g. candidate.stage_changed, email.sent |
| entity_type | varchar(100) | NOT NULL | e.g. candidate, campaign |
| entity_id | uuid | NOT NULL | |
| before_state | jsonb | NULLABLE | Snapshot before change |
| after_state | jsonb | NULLABLE | Snapshot after change |
| metadata | jsonb | NULLABLE | Extra context |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

Index on entity_id. Index on created_at DESC.

---

## 7. API Design

All endpoints are Next.js App Router Route Handlers under app/api/. Auth is checked via the NextAuth session in every handler. The session check is a single middleware wrapper: withAuth(handler). All responses follow { data, error, meta } structure. Pagination is cursor-based where applicable.

### Candidates

| Method | Path | Purpose | Request fields | Response fields | Auth |
|---|---|---|---|---|---|
| GET | /api/candidates | List all candidates for a campaign | query: campaign_id, stage, role, has_email (boolean), date_from, date_to, cursor, limit | data: candidate[], meta: { next_cursor, total } | Required |
| POST | /api/candidates | Create single candidate | body: full_name, email?, linkedin_url?, role, campaign_id | data: candidate | Required |
| GET | /api/candidates/[id] | Get candidate detail with email history | — | data: candidate & { email_events: email_event[], audit: audit_log[] } | Required |
| PATCH | /api/candidates/[id] | Update candidate fields | body: any editable field (stage, notes, email, linkedin_url) | data: candidate | Required |
| DELETE | /api/candidates/[id] | Soft-delete (GDPR erasure) | — | data: { deleted: true } | Required |
| POST | /api/candidates/[id]/stage | Move candidate to new stage | body: stage (new stage id), dry_run? (boolean) | data: candidate, email_queued: boolean | Required |
| POST | /api/candidates/bulk-action | Bulk stage change or bulk email | body: candidate_ids[], action (stage_change or send_email), stage?, template_id?, dry_run? | data: { processed: number, email_queued: number, errors: [] } | Required |

### Campaigns

| Method | Path | Purpose | Request fields | Response fields | Auth |
|---|---|---|---|---|---|
| GET | /api/campaigns | List all campaigns | — | data: campaign[] | Required |
| POST | /api/campaigns | Create campaign | body: role_name, google_sheet_url?, google_form_link?, zoom_link?, zoom_meeting_id?, zoom_passcode?, interview_date?, interview_time?, interview_mode? | data: campaign | Required |
| GET | /api/campaigns/[id] | Get campaign with pipeline stats | — | data: campaign & { counts_by_stage: { stage: string, count: number }[] } | Required |
| PATCH | /api/campaigns/[id] | Update campaign settings | body: any campaign field | data: campaign | Required |

### Google Sheets Import and Sync

| Method | Path | Purpose | Request fields | Response fields | Auth |
|---|---|---|---|---|---|
| POST | /api/campaigns/[id]/import | Import candidates from Google Sheet | body: sheet_url, header_row_mapping: { name_col, email_col, linkedin_col } | data: { imported: number, skipped: number, errors: [] } | Required |
| POST | /api/campaigns/[id]/sync | Push pipeline status back to Google Sheet | body: write_stage_column (boolean), write_email_status_column (boolean) | data: { rows_updated: number } | Required |

### Email Templates

| Method | Path | Purpose | Request fields | Response fields | Auth |
|---|---|---|---|---|---|
| GET | /api/templates | List all templates | — | data: email_template[] | Required |
| POST | /api/templates | Create template | body: name, stage, subject, body_html, body_text | data: email_template | Required |
| PATCH | /api/templates/[id] | Edit template | body: any template field | data: email_template | Required |
| POST | /api/templates/[id]/preview | Render template with sample variables | body: sample_candidate_id? | data: { subject: string, html: string, text: string } | Required |

### Email Sending

| Method | Path | Purpose | Request fields | Response fields | Auth |
|---|---|---|---|---|---|
| POST | /api/email/send | Send email to one candidate | body: candidate_id, template_id, dry_run? | data: { queued: boolean, idempotency_key: string } | Required |
| POST | /api/email/send-bulk | Queue emails to multiple candidates | body: candidate_ids[], template_id, dry_run?, confirmation_token | data: { queued: number, skipped: number } | Required |
| GET | /api/email/events | List delivery events | query: candidate_id?, campaign_id?, status?, cursor | data: email_event[] | Required |

### Enrichment

| Method | Path | Purpose | Request fields | Response fields | Auth |
|---|---|---|---|---|---|
| POST | /api/enrich | Look up email from LinkedIn URL | body: candidate_id, linkedin_url | data: { email: string, confidence: number, source: string } | Required |
| POST | /api/enrich/bulk | Enrich multiple missing emails | body: candidate_ids[] | data: { enriched: number, not_found: number, credits_remaining: number } | Required |

### Webhooks (unauthenticated — verified by signature)

| Method | Path | Purpose | Verification |
|---|---|---|---|
| POST | /api/webhooks/resend | Receive Resend delivery events (delivered, bounced, opened, complained) | Svix-Signature header verified against RESEND_WEBHOOK_SECRET |

### Cron

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | /api/cron/process-sends | Process due rows in scheduled_sends | CRON_SECRET header matches env var |

### Health

| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | Returns { status: ok, db: connected } for uptime monitoring |

---

## 8. Email Subsystem

### Template Storage

Templates are stored in the email_templates table with both HTML and plain-text versions. The admin can edit them in the dashboard template editor, which includes a live preview panel. Templates are also seeded from TypeScript constants in lib/email/templates/ so that a fresh deployment starts with sensible defaults.

### Variable Substitution

Substitution is a simple find-and-replace over {VariableName} tokens at send time. The substitution function in lib/email/substitutor.ts accepts a template string and a variables object and replaces all matched tokens. Unmatched tokens are left as-is and flagged in the audit log. Variables available at send time: CandidateFirstName, CandidateFullName, CandidateEmail, RoleName, OrgName, FormLink, Deadline, InterviewDate, InterviewTime, InterviewMode, MeetingLink, MeetingID, Passcode, UnsubscribeLink.

### HTML and Plain-Text Fallback

Every email send includes both a html field and a text field in the Resend API call. Resend forwards the appropriate version based on the recipient's mail client. The plain-text version is not auto-generated from HTML — it is maintained separately in the template to ensure clean, readable fallback copy.

### Unsubscribe Link and CAN-SPAM Footer

Every email template includes an UnsubscribeLink variable that resolves to /unsubscribe?token={jwt}. The JWT encodes the candidate ID with a 30-day expiry and is signed with UNSUBSCRIBE_SECRET. Clicking the link calls POST /api/unsubscribe, which sets candidates.opted_out = true and cancels any pending scheduled_sends for that candidate. No further emails are sent to opted-out candidates. Every template must also include a plain-text footer with: sender organisation name, physical address (Omysha Foundation address), and the statement "You received this because you applied for [RoleName] at [OrgName]. Reply to this email or click the unsubscribe link to stop receiving emails."

### Domain Verification and DNS Records

Before the first live send, the sending domain (e.g. hr@a4gimpact.org or a subdomain like outreach.a4gimpact.org) must have the following DNS records set, as provided by the Resend dashboard:

- SPF record: TXT record on the sending domain. Value provided by Resend. Authorises Resend's mail servers to send on behalf of the domain.
- DKIM record: Two CNAME records pointing to Resend's DKIM infrastructure. Enables cryptographic signing of outgoing mail.
- DMARC record: TXT record _dmarc.yourdomain.com. Recommended value for recruitment email: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com. Start with p=none (monitor mode) before moving to p=quarantine.
- Return-Path / MAIL FROM: Resend handles this via its shared infrastructure on the free plan.

All four records must show green in the Resend dashboard before any candidate emails are sent.

### Bounce and Complaint Handling

Resend fires a webhook to /api/webhooks/resend on each delivery event. The handler:

- On delivered: sets email_events.status = delivered, email_events.delivered_at = timestamp
- On opened: sets email_events.status = opened, email_events.opened_at = first open timestamp (subsequent opens ignored)
- On bounced: sets email_events.status = bounced, logs error_message, cancels all pending scheduled_sends for that candidate, sets candidates.email_bounced = true
- On complained (spam report): sets email_events.status = complained, sets candidates.opted_out = true, cancels all pending sends, logs to audit_log with high-priority flag, triggers an email alert to the HR admin

Bounce rate is monitored. If the rolling 7-day bounce rate across a campaign exceeds 5%, the send dispatcher pauses all outgoing email for that campaign and alerts HR.

### Webhook Endpoint Spec

- Method: POST /api/webhooks/resend
- Verification: reads the Svix-Signature, Svix-Id, and Svix-Timestamp headers; verifies HMAC against RESEND_WEBHOOK_SECRET using the svix npm library; returns 401 if verification fails
- Body: Resend event object with fields: type (email.delivered, email.bounced, email.opened, email.complained), data.message_id, data.to, data.created_at
- Response: 200 on success, 400 on malformed body, 401 on failed signature

---

## 9. Email Enrichment Subsystem

### Provider Comparison

The following five providers were evaluated for finding candidate emails from a LinkedIn profile URL or name plus company. Chrome extensions that scrape from a logged-in LinkedIn session are excluded — they carry the same TOS Section 8.2 risk as the abandoned LinkedIn DM approach.

| Provider | Free tier | Credits/month | Lookup method | Accuracy | LinkedIn URL input | API available | Recommended |
|---|---|---|---|---|---|---|---|
| Snov.io | Yes, no CC required | 50 credits | Own database, 7-tier real-time verification | 98–99% claimed | Yes — accepts LinkedIn profile URL directly | Yes — Email Finder API | Primary pick |
| Hunter.io | Yes | 25 searches, 50 verifications | Domain-based index | ~95% | No — Hunter discontinued LinkedIn extension; requires name + domain | Yes | Fallback for domain searches only |
| Apollo.io | Yes | 20 credits/month free (reports vary widely) | 275M contact database | High but catch-all rates noted | Yes — accepts profile URL | Yes | Secondary fallback |
| Skrapp.io | Yes | 100 credits/month | Own database, LinkedIn-indexed | ~80% | Yes — via extension (session-based — excluded) | Yes but relies on extension | Not recommended — extension is session-based |
| GetProspect | Yes | 50 emails/month | Own database | Moderate | Yes — via extension (session-based — excluded) | Limited | Not recommended — extension is session-based |

**Decision: Snov.io as primary.**

Snov.io accepts a LinkedIn profile URL as input to its Email Finder API — no browser session required, no LinkedIn login involved. It queries Snov.io's own database and applies a 7-tier real-time verification (MX records, SMTP checks, greylisting handling, domain validation). At 98–99% claimed accuracy it is the highest-rated option. The 50 free credits per month covers 50 missing-email lookups, which is sufficient for A4G's volume. Hunter.io has discontinued its LinkedIn extension and cannot accept LinkedIn URLs directly — it requires name plus domain, making it less useful for this use case. Apollo is a valid fallback if Snov.io credits run out.

**Important note:** Neither Snov.io nor any enrichment provider guarantees GDPR compliance on your behalf. Using enriched emails for recruitment outreach is a legitimate use case, but every email sent must include an unsubscribe mechanism and a clear statement of how the contact information was obtained.

### Enrichment Endpoint Implementation

The POST /api/enrich endpoint:

1. Receives candidate_id and linkedin_url
2. Checks if the candidate already has an email — if yes, returns without consuming a credit
3. Calls the Snov.io Email Finder API: POST to https://api.snov.io/v1/get-emails-from-linkedin-link with body fields linkedin_link and access_token (obtained via Snov.io OAuth using SNOVIO_CLIENT_ID and SNOVIO_CLIENT_SECRET)
4. If a result is found, updates candidates.email, sets candidates.email_enriched = true, writes to audit_log
5. Returns the found email, confidence score, and remaining credits
6. If not found, returns not_found: true without updating the candidate record

---

## 10. Kanban Frontend

### Page Routes (App Router)

- app/page.tsx — redirects to /dashboard if authenticated, else to /login
- app/login/page.tsx — NextAuth sign-in page with email/password form
- app/dashboard/page.tsx — campaign selector landing
- app/dashboard/[campaignId]/page.tsx — Kanban board for a campaign
- app/dashboard/[campaignId]/candidates/[candidateId]/page.tsx — candidate detail drawer (rendered as a modal/sheet over the board)
- app/dashboard/[campaignId]/import/page.tsx — Google Sheets import wizard
- app/dashboard/[campaignId]/templates/page.tsx — email template editor
- app/settings/page.tsx — global settings: enrichment credits, send window, daily cap, kill switch

### Component Tree

The Kanban board component tree:

- KanbanBoard (client component, DnDContext provider)
  - KanbanColumn (per stage — 9 columns)
    - SortableContext
      - CandidateCard (draggable card with name, role, stage badge, last action, email status dots)
  - DragOverlay (renders the card preview while dragging)
- CandidateDetailSheet (shadcn Sheet component, opens on card click)
  - CandidateProfile (full fields, edit in place)
  - EmailTimeline (list of email_events with status icons)
  - ActionButtons (Send Stage-1, Send Follow-up, Mark Rejected, Add Note, Enrich Email)
- BulkActionBar (appears when multiple cards are selected via checkbox)
  - BulkSendModal (confirmation modal with dry-run toggle, shows rendered preview)
- ImportWizard (multi-step: paste Sheet URL → map columns → preview → import)
- FilterBar (role, stage, date range, has-email, has-linkedin)

### State Management

TanStack Query (React Query v5) is used for all server state. It handles caching, background refetching, optimistic updates, and cache invalidation cleanly in the App Router model. Zustand is used only for ephemeral UI state (selected cards for bulk action, open/closed state of the detail sheet, active drag item). No Redux, no Context API for data. Server Components fetch the initial page data (campaign stats, stage list); the Kanban board itself is a Client Component because it requires DnD interactivity.

Rationale for TanStack Query over pure Server Components: the Kanban board needs real-time-ish updates (polling every 30 seconds), optimistic updates on drag-drop, and invalidation after mutation. TanStack Query handles all of this cleanly with minimal boilerplate and full TypeScript support.

### dnd-kit Integration Pattern

The KanbanBoard wraps all columns in a DndContext with a custom collision detection strategy (closestCenter with a pointer-distance fallback for cross-column drops). Each column uses SortableContext with a vertical list sorting strategy for within-column reordering. When a drag ends (onDragEnd), the handler:

1. Identifies source column (stage) and destination column (stage)
2. If same column: updates local order via Zustand (optimistic)
3. If different column: fires an optimistic update via TanStack Query's setQueryData to move the card immediately in the UI, then calls POST /api/candidates/[id]/stage in the background
4. If the API call fails: rolls back via TanStack Query's onError handler, shows a toast notification

The DragOverlay renders a semi-transparent copy of the card during drag to maintain spatial context for the user.

### Optimistic Updates

Stage transitions update the UI immediately before the server confirms. The pattern: useMutation in TanStack Query with an onMutate callback that calls queryClient.setQueryData to move the card, and an onError callback that calls queryClient.setQueryData to move it back. This gives Trello-like instant feedback.

### Polling for Real-Time Updates

useQuery for the Kanban board is configured with refetchInterval: 30000 (30 seconds). This provides near-real-time visibility into pipeline changes (e.g. when the cron job fires and updates email delivery status) without a persistent WebSocket connection, which would require a paid plan or additional infrastructure.

---

## 11. Safety and Rate Limiting

### Send Rules

All outbound emails pass through a single function: dispatchEmail() in lib/email/dispatcher.ts. This function enforces all safety rules before calling the Resend API. No code path sends email outside of this function.

| Rule | Test mode value | Production value | Enforcement |
|---|---|---|---|
| Daily cap | 10 emails/24-hour window | 80 emails/24-hour window | Checked against email_events count for the day before each send |
| Send window | 9:00 AM – 6:00 PM IST | 9:00 AM – 6:00 PM IST | dispatchEmail() checks current time in Asia/Kolkata timezone; outside window, email is queued to scheduled_sends for next open window |
| Delay between sends | 5 seconds (testing) | 90–180 seconds randomised | dispatchEmail() inserts a scheduled_sends row with scheduled_for = now() + random(90, 180) seconds; cron processes the queue |
| Dry-run mode | Enabled by default | Disabled | When dry_run = true, the function logs the would-be send but does not call Resend; returns { dry_run: true, would_have_sent: true } |
| Kill switch | — | Instant halt | If SEND_KILL_SWITCH=true in env vars, dispatchEmail() returns immediately without sending or queuing; all API endpoints that call it return { halted: true } |

### Kill Switch

Setting SEND_KILL_SWITCH=true in Vercel environment variables and redeploying (or updating the env without redeployment if using Vercel's instant env propagation) halts all outbound email within seconds. The dashboard Settings page shows the current kill switch state with a toggle that calls PATCH /api/settings with { kill_switch: boolean }. This writes to a settings table (single-row) rather than requiring a redeployment.

---

## 12. Background Job Design

### Vercel Cron Schedule

A single cron job is configured in vercel.json targeting GET /api/cron/process-sends. On Vercel Hobby, the minimum interval is 1 hour. The cron expression is 0 * * * * (top of every hour).

The cron handler is protected by verifying the Authorization: Bearer {CRON_SECRET} header that Vercel injects automatically. Requests without this header return 401.

### scheduled_sends Table Lifecycle

- pending: row created when a send is queued (either by a stage transition, a bulk action, or a reminder trigger)
- processing: cron sets status = processing on rows it is about to handle; this prevents duplicate processing if the cron fires twice
- done: set after successful Resend API call; email_events row is also written
- failed: set after 3 retry attempts all fail; error_message populated; HR notified via audit_log entry flagged for attention
- cancelled: set when a candidate opts out, bounces, or is manually removed from the campaign

### Retry Policy

The cron handler processes all rows WHERE scheduled_for <= now() AND status = 'pending' AND retry_count < 3. For each row:

1. Sets status = processing (atomic update with WHERE status = pending to prevent race conditions)
2. Calls dispatchEmail()
3. On success: sets status = done
4. On failure: increments retry_count, sets scheduled_for = now() + (retry_count * 15 minutes) for exponential backoff, sets status = pending
5. After retry_count reaches 3: sets status = failed, writes audit_log entry

### Idempotency Keys

Every scheduled_sends row and every email_events row has a unique idempotency_key generated as {candidate_id}:{template_id}:{campaign_id}:{date_yyyymmdd}. The Resend API call includes this as the idempotency key. This guarantees that even if the cron fires twice in quick succession or a network timeout causes an ambiguous result, the same email is never delivered twice to the same candidate for the same template on the same day.

---

## 13. Logging, Error Handling, and Observability

### Audit Log vs Console

The audit_log table records: every stage transition (who moved which candidate and when), every email sent (candidate, template, idempotency key, result), every import (rows imported, skipped, errors), every enrichment call (credit used, result), every bulk action, every HR override, every template edit, and every settings change.

Console logs (via Vercel's built-in log streaming) record: cron job start/end and row counts processed, Resend API response codes, webhook receipt confirmations, and unhandled errors with stack traces.

### Bounce Rate Alerting

A background check in the cron handler calculates the 7-day rolling bounce rate per campaign after each run. If the rate exceeds 5%, the handler: sets campaign.status = paused_bounce_alert, writes an urgent audit_log entry, and calls Resend to send an alert email to the HR admin address (this one email is sent outside the normal queue, directly via the Resend API, as an administrative alert).

### Vercel Logs

All Route Handler errors are caught by a top-level try/catch wrapper that logs the error to console.error with a structured JSON payload: { endpoint, method, error_message, stack, timestamp }. Vercel captures these in its log dashboard. The Vercel Hobby tier retains logs for 1 hour; upgrading to Pro extends this to 3 days.

### Free Uptime Monitoring

UptimeRobot (free tier, 50 monitors, 5-minute checks) monitors GET /api/health. The health endpoint checks Neon connectivity by running a SELECT 1 query. If the check fails, UptimeRobot sends an email alert to the admin.

---

## 14. Authentication and Authorization

**Chosen: NextAuth v5 (Auth.js) with credentials provider**

For a single admin user, NextAuth with a hardcoded bcrypt-hashed password is the correct choice. Clerk and Better Auth both add external service dependencies that are not justified for one login. The implementation:

- The admin password is stored as ADMIN_PASSWORD_HASH (bcrypt hash) in environment variables
- auth.config.ts defines a CredentialsProvider that calls bcryptjs.compare() against the env var hash
- All API routes call auth() from NextAuth and return 401 if the session is null
- Sessions use the JWT strategy (no additional database table needed)
- Session expiry: 8 hours; re-login required after inactivity
- The login page is app/login/page.tsx with a simple email/password form using shadcn/ui components

If multi-user support is needed in v2, the migration path is: add a users table, switch NextAuth to the database session strategy with Drizzle adapter, and optionally migrate to Clerk for pre-built UI.

---

## 15. Security and Secrets

### Environment Variable Inventory

| Variable | Purpose | Scope |
|---|---|---|
| DATABASE_URL | Neon Postgres connection string (pooled) | Server only |
| DATABASE_URL_UNPOOLED | Direct connection for migrations | Server only, CI only |
| NEXTAUTH_SECRET | JWT signing secret for NextAuth | Server only |
| NEXTAUTH_URL | App base URL (e.g. https://a4g-recruit.vercel.app) | Server only |
| ADMIN_EMAIL | Login email for single admin user | Server only |
| ADMIN_PASSWORD_HASH | bcrypt hash of admin password | Server only |
| RESEND_API_KEY | Resend sending API key | Server only |
| RESEND_WEBHOOK_SECRET | Svix webhook signing secret from Resend dashboard | Server only |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Service account email for Sheets API | Server only |
| GOOGLE_SERVICE_ACCOUNT_KEY | Service account private key (JSON string, base64 encoded) | Server only |
| SNOVIO_CLIENT_ID | Snov.io OAuth client ID | Server only |
| SNOVIO_CLIENT_SECRET | Snov.io OAuth client secret | Server only |
| CRON_SECRET | Vercel cron authentication secret | Server only |
| UNSUBSCRIBE_SECRET | JWT signing secret for unsubscribe tokens | Server only |
| SEND_KILL_SWITCH | "true" to halt all sends immediately | Server only |
| SEND_DAILY_CAP | Override default cap (default: 80) | Server only |
| NODE_ENV | development or production | Build time |

All variables are stored in .env.local locally and in Vercel Environment Variables in production. No variable is ever prefixed with NEXT_PUBLIC_ — none are exposed to the browser.

### Google Service Account Scope

The Google Service Account is granted: read access to candidate source sheets (import), read-write access to campaign tracker sheets (two-way sync). It is never granted access to Google Drive broadly or to any sheet it has not been explicitly shared with.

### Webhook Signature Verification

The /api/webhooks/resend handler uses the svix npm package to verify the Svix-Signature header against RESEND_WEBHOOK_SECRET before processing any payload. Unverified requests return 401 immediately. The raw request body (not the parsed JSON) is used for verification.

---

## 16. Compliance

### CAN-SPAM

Every outgoing email includes: the sender's physical mailing address in the footer, a clear identification of A4G as the sender, a functional unsubscribe mechanism (the UnsubscribeLink variable), and an honest subject line. The unsubscribe mechanism must process opt-out requests within 10 business days (the application processes them within seconds).

### GDPR Basics

Candidates are EU-resident students and interns. Key obligations:

- Lawful basis: legitimate interest for recruitment screening of applicants who submitted their details via LinkedIn application
- Right to erasure: DELETE /api/candidates/[id] performs a soft-delete (sets deleted_at, nulls PII fields within 30 days via a scheduled purge job)
- Data minimisation: only fields needed for recruitment are stored
- Retention: all candidate PII is purged 90 days after a campaign closes via a Vercel Cron job that runs daily and checks for campaigns where closed_at < now() - 90 days

### Opt-Out Flow

Clicking an unsubscribe link: decodes and verifies the JWT, sets candidates.opted_out = true, cancels all scheduled_sends for that candidate, shows a confirmation page ("You have been unsubscribed. No further emails will be sent."), and writes to audit_log. No re-subscription mechanism exists in v1.

---

## 17. Testing Plan

### Unit Tests (Vitest)

- lib/email/substitutor.ts — variable substitution with all token types, missing token behaviour
- lib/email/dispatcher.ts — kill switch, send window enforcement, daily cap, dry-run mode
- lib/enrichment/snov.ts — mocked API responses, not-found handling, credit exhaustion
- lib/sheets/importer.ts — column mapping, missing email handling, duplicate row detection
- lib/cron/processor.ts — idempotency key collision, retry logic, status transitions

### Component Tests (Playwright)

- KanbanBoard — render all 9 columns, card count per column
- DragAndDrop — drag card from New to Stage-1 Sent, verify API call fired, verify optimistic update
- BulkActionBar — select 3 cards, open bulk send modal, verify dry-run preview renders correctly
- CandidateDetailSheet — open card, verify email timeline renders, click Send Stage-1, verify confirmation
- FilterBar — filter by stage, verify card count updates, filter by has-email=false

### Integration Tests

- Import flow: configure a test Google Sheet (separate from production), run import, verify candidates appear in Neon, verify tracker sheet is updated
- Email send: use Resend's test domain (delivered@resend.dev returns a successful delivery event), send a stage-1 email, verify email_events row is created, verify webhook fires and updates status to delivered
- Unsubscribe: send email to test address, decode JWT from unsubscribe URL, call unsubscribe endpoint, verify opted_out = true and scheduled_sends cancelled

### Dry-Run End-to-End

Before any live send, run the entire pipeline in dry_run = true mode: import 3 test candidates, move one to Stage-1 Sent, verify the would-be send is logged in audit_log with dry_run: true, verify no Resend API call was made.

---

## 18. Deployment

### Vercel Project Setup

1. Create a new Vercel project linked to the GitHub repository
2. Set framework preset to Next.js
3. Add all environment variables from Section 15 in the Vercel dashboard under Settings → Environment Variables
4. Connect the Neon database via the Vercel Neon integration (Vercel dashboard → Storage → Add Database → Neon)
5. Add vercel.json to the repository with the cron configuration pointing to /api/cron/process-sends with schedule "0 * * * *"
6. Run npx drizzle-kit migrate to apply the initial schema to the Neon production database

### Custom Domain (Optional)

Add the custom domain in Vercel project settings. Update NEXTAUTH_URL to match. Update Resend domain verification DNS records if sending from a custom domain.

### Rollback Procedure

Vercel retains all deployments. In the Vercel dashboard: select the previous deployment and click Promote to Production. This is a zero-downtime rollback. For database schema rollbacks: Drizzle generates plain SQL migration files, so reverting a migration is a manual SQL operation against Neon via the Neon console. Always test migrations on a Neon branch before applying to production.

---

## 19. Milestones and Build Order

Each phase is independently demoable before the next begins.

| Phase | What Gets Built | Demoable Output | Duration |
|---|---|---|---|
| 1 | Neon schema (Drizzle), Google Sheets import, candidate list page (table view, no Kanban), NextAuth login | HR can import candidates from a sheet and see them in a table | 4 days |
| 2 | Kanban board read-only: all 9 columns render with correct candidate counts, filter bar works | HR can see the pipeline as a board, filter by role and stage | 3 days |
| 3 | Drag-drop stage changes: dnd-kit integration, optimistic updates, POST /api/candidates/[id]/stage | HR can drag cards between columns and the change persists | 3 days |
| 4 | Email subsystem: Resend integration, template engine, dispatchEmail() safety layer, webhook handler, email_events tracking, dry-run mode | HR can send a Stage-1 email to one candidate (dry-run first, then live), see delivery status update on the card | 5 days |
| 5 | Email enrichment: Snov.io integration, enrich button on candidate card, bulk enrichment | HR can fill missing emails from LinkedIn URLs without leaving the app | 2 days |
| 6 | Bulk actions + automation: bulk send with confirmation modal, scheduled_sends table, Vercel Cron, 20-hour reminder trigger | HR can select 50 cards and send Stage-1 to all; system auto-sends reminders at 20 hours | 4 days |
| 7 | Polish and compliance: two-way Sheets sync, unsubscribe flow, GDPR erasure endpoint, bounce rate alerting, UptimeRobot setup, audit log page in dashboard | Full compliance-ready system ready for production use | 3 days |

Total estimate: approximately 24 working days from kickoff to production-ready (4–5 weeks for a solo developer).

---

## 20. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Email deliverability: sends land in spam | Medium | High | Proper SPF/DKIM/DMARC setup, sending from a verified custom domain, low send volume, personalised subject lines, clean candidate list, unsubscribe link in every email |
| Resend 3,000/month free tier exceeded | Low | Medium | A4G sends under 200 emails per campaign; 3,000/month covers 15 full campaigns. If volume grows, switch to Brevo (9,000/month free) per the documented switch path in Section 5 |
| Google Sheets API rate limit (300 req/min) | Low | Low | Import batches 100 rows per API call; a 200-candidate import uses 2 calls. Well within quota |
| Snov.io 50 credits/month exhausted | Medium | Low | Apollo.io free tier (20 credits) as fallback; most candidates already have emails in the sheet so enrichment is the exception not the rule |
| Vercel Hobby cron fires only every hour | Medium | Medium | The 90–180 second delay window between sends is handled by the scheduled_sends table; the 1-hour cron is sufficient because no single campaign sends at sub-hour granularity. Upgrade to Vercel Pro ($20/month) if real-time sends become necessary |
| Neon free tier compute hours exhausted | Low | Medium | 190 compute hours/month = ~6 hours of active compute per day. For a tool used in bursts during campaigns, this is generous. Scale-to-zero means idle time consumes nothing |
| Enriched emails are stale or wrong | Medium | Medium | Snov.io's 98–99% accuracy and 7-tier verification reduces this significantly. Bounced enriched emails are flagged via webhook and marked in the candidate record |

---

## 21. Open Questions and Assumptions

- Assumed: candidate emails are present in the majority of Google Sheet rows; enrichment is needed for a small minority (under 20%)
- Open: what is the exact column mapping in the current A4G Google Sheet? (header names for name, email, LinkedIn URL columns) — needed before Phase 1 import can be tested
- Open: should stage transitions always trigger emails automatically, or should HR confirm each one? Assumption: auto-send on drag-drop for all stages, with a 5-second undo toast before the email actually dispatches
- Open: what is the A4G sending domain? A custom domain is strongly recommended over a free Gmail or Outlook address for deliverability
- Open: Vercel Hobby is for personal/non-commercial projects. If A4G is classified as a business or NGO, Vercel Pro ($20/month) may be required per Vercel's terms
- Assumed: the Google Form evaluation criteria (Tier 1 deal-breakers and Tier 2 flexible criteria as specified by Suhani) will be applied manually in v1 — the system tracks form submission status but does not auto-evaluate form responses in this version. Auto-evaluation is a v2 feature

---

## 22. Out of Scope for v1 (v2 Ideas)

- Reply parsing via IMAP: reading candidate replies to understand whether they confirmed attendance, asked a question, or withdrew
- AI-drafted follow-ups: using Claude or another LLM to generate personalised follow-up messages based on candidate profile
- Google Form response auto-evaluation: automatically applying Suhani's Tier 1 / Tier 2 criteria to form submissions and updating the pipeline stage
- SMS or WhatsApp outreach: additional channel for candidates who don't respond to email
- Calendar booking: allowing candidates to self-schedule interviews via Calendly or a built-in booking page
- Multi-user roles: separate HR manager and admin roles, team member invitations
- Slack notifications: alerting the HR team when a candidate submits the form or confirms attendance
- Analytics dashboard: open rate trends, stage conversion rates, time-in-stage histograms

---

## 23. Generating the Word (.docx) Version

To convert this Markdown PRD to a clean, formatted Word document, run the following single command from the directory containing this file (requires pandoc installed on your machine — install via brew install pandoc on macOS or https://pandoc.org/installing.html on Windows/Linux):

pandoc A4G_Recruitment_Automation_PRD.md -o A4G_Recruitment_Automation_PRD.docx --from markdown --to docx

For a more polished output with custom heading styles and fonts, first generate a reference document with pandoc --print-default-data-file reference.docx > custom-reference.docx, edit it in Word to set your preferred styles, then run:

pandoc A4G_Recruitment_Automation_PRD.md -o A4G_Recruitment_Automation_PRD.docx --reference-doc=custom-reference.docx

---

## What to Build First

The minimum slice that delivers real value immediately is Phase 1 + Phase 4 without the Kanban board: build the Google Sheets importer so Suhani's candidate data lives in a database, wire up Resend with the Stage-1 email template and the safety dispatcher, and add a simple table view with a "Send Stage-1" button per candidate. This is three days of work, costs nothing to run, eliminates the most painful manual task (copy-pasting 200 DMs), and produces a working audit trail from day one. The Kanban board, bulk actions, and enrichment are meaningful improvements on top of that foundation — but Suhani gets immediate, measurable time savings the moment the first email sends automatically.
