# A4G LinkedIn Recruitment Automation — Progress Tracker

Single source of truth for **what's being built right now** and **what's done**. Updated by Orion (Orchestrator) when a version starts, a PR merges, or a blocker appears. Build versions and agent roles in `BUILD_PLAN.md`. PRD in `PRD_v2.1.md`.

---

## Current Version

**v0.1 — Foundation + Stage-1 Email** · Status: `in progress`

---

## Version Status Overview

| Version | What | Status | Started | Completed |
|---|---|---|---|---|
| v0.1 | Foundation + Stage-1 email send | not started | — | — |
| v0.2 | Google Form evaluation engine | blocked on v0.1 | — | — |
| v0.3 | Reminders + Stage-2 invite + reply detection | blocked on v0.2 | — | — |
| v0.4 | Campaign tracker sheet + approval gates + polish | blocked on v0.3 | — | — |

---

## v0.1 — Foundation + Stage-1 Email · Work Specs

**Demo criteria (must all pass before v0.1 merges):**

- [ ] `npm run dev` starts locally without errors
- [ ] `/login` accepts the admin credentials from `.env.local`
- [ ] HR can create a campaign (role name + Google Form link + Zoom details)
- [ ] HR can import applicants from a Google Sheet URL (exported via ApplicantSync Chrome extension)
- [ ] After import, `/campaigns/:id` shows candidates in a table with name, email, LinkedIn URL, role, stage
- [ ] HR can send a Stage-1 screening form email to a single candidate
- [ ] Email arrives in candidate's inbox via Gmail SMTP with correct personalisation (`{CandidateFirstName}`, `{RoleName}`, `{FormLink}`, `{Deadline}`)
- [ ] Email queue processes at max 20/hr with 30-60s delays, only during 9am-6pm IST window
- [ ] Kill switch env flag halts all sends immediately
- [ ] Every write emits an `audit_log` row
- [ ] Data persists across server restart (PostgreSQL connection works)

### Orion (Orchestrator) · `main`

- [ ] Remove v1.0 Resend deps from `package.json` (`resend` if present); add `nodemailer` + `@types/nodemailer`
- [ ] Update `.env.local` with Gmail SMTP placeholders (user fills in real values)
- [ ] After all 3 agent PRs merge, run demo criteria end-to-end
- [ ] Ship CI workflow (`.github/workflows/ci.yml`) as a follow-up PR

### Basil (Backend) · `agent/backend/v0.1-foundation`

**Branch from latest `main`. Rewrite `db/schema.ts` from scratch — do NOT modify v1.0 migration.**

- [ ] New Drizzle schema `db/schema.ts` — 6 tables for v0.1:
  - `campaigns` — id (uuid PK), role_name, google_form_url, zoom_link, zoom_meeting_id, zoom_passcode, interview_date, interview_time, interview_mode, status (active/paused/closed), created_at
  - `candidates` — id (uuid PK), full_name, email (nullable, partial unique where not null), linkedin_url, headline, location, application_date, campaign_id (FK), stage (default 'imported'), email_enriched (bool), notes, google_sheet_row, created_at, updated_at
  - `email_queue` — id (uuid PK), candidate_id (FK), campaign_id (FK), template_type (stage1/reminder/stage2), scheduled_for (timestamptz), status (pending/processing/sent/failed/cancelled), retry_count (default 0), idempotency_key (unique), error_message, sent_at, created_at. Filtered index on `scheduled_for WHERE status='pending'`
  - `stages` — id (varchar PK), label, position. Seed: imported, good_fit, stage1_sent, form_submitted, evaluated, reminder_sent, stage2_sent, confirmed, rejected (9 stages)
  - `audit_log` — same as v1.0 (actor, action, entity_type, entity_id, before/after jsonb, metadata jsonb, created_at)
  - `role_configs` — id (uuid PK), role_name (unique), google_form_url, zoom_link, zoom_meeting_id, zoom_passcode, default_interview_date, default_interview_time, interview_mode, created_at, updated_at
- [ ] New migration `db/migrations/0001_v2.1_reset.sql` via `drizzle-kit generate`. Drop v1.0 tables first if they exist, then create v2.1 tables
- [ ] Seed script: 9 stages
- [ ] `lib/types.ts` — shared types: `Campaign`, `Candidate`, `RoleConfig`, `EmailQueueItem`, `Stage`, `AuditLogEntry`. Include `CandidatesListResponse`. Publish to CONTRACTS.md §4
- [ ] `lib/audit.ts` — keep `logAudit` pattern from v1.0
- [ ] `lib/email/sender.ts` — `sendEmail(to, subject, html, text)` using the Nodemailer transport from Iris. Rate limiting: check `email_queue` count for current hour, check IST sending window, check kill switch. If outside window or cap exceeded, return `{ queued: true }` instead of sending
- [ ] `lib/email/templates.ts` — `renderStage1(candidate, campaign, roleConfig)` returning `{ subject, html, text }` with variable substitution. Use the real Stage-1 template from PRD v2.1 §6.2.2
- [ ] `app/api/campaigns/route.ts` — `POST` (create campaign with role_config link) + `GET` (list campaigns)
- [ ] `app/api/campaigns/[id]/route.ts` — `GET` (campaign detail with candidate counts)
- [ ] `app/api/campaigns/[id]/import/route.ts` — `POST { google_sheet_url, column_mapping }` — calls `fetchSheetRows` from Iris, writes candidates to DB + audit log
- [ ] `app/api/candidates/route.ts` — `GET` with campaign_id filter, pagination
- [ ] `app/api/emails/send/route.ts` — `POST { candidate_id, template_type }` — renders template, inserts into `email_queue`, returns queued status
- [ ] `app/api/cron/process-queue/route.ts` — `GET` — processes pending `email_queue` rows: calls `sendEmail`, updates status, respects rate limits. Protected by `CRON_SECRET` header
- [ ] `app/api/health/route.ts` — keep from v1.0
- [ ] NextAuth v5 — keep `auth.ts` + `auth.config.ts` + `middleware.ts` from v1.0 (they work)
- [ ] Publish all endpoint signatures to CONTRACTS.md §2 **before** implementing
- [ ] Open PR to `main`

### Fern (Frontend) · `agent/frontend/v0.1-dashboard`

**Wait for Basil to publish CONTRACTS.md §2 endpoints + §4 types. Branch from latest `main`.**

- [ ] `/login` — keep v1.0 login form (works with NextAuth)
- [ ] `/dashboard` — campaign list page: shows all campaigns with candidate count + status. "Create Campaign" button
- [ ] Campaign create modal: role name, Google Form URL, Zoom link, meeting ID, passcode, interview date/time/mode. Submits to `POST /api/campaigns`
- [ ] `/campaigns/[id]` — candidate table (name, email, LinkedIn URL, stage, actions). Import button in header. "Send Stage-1" button per candidate row
- [ ] Import modal: paste Google Sheet URL → column mapping preview → confirm. Posts to `POST /api/campaigns/[id]/import`. Toast with imported/skipped/errors
- [ ] Send Stage-1 confirmation dialog: shows email preview (template with candidate's name filled in) → confirm → calls `POST /api/emails/send`
- [ ] Loading skeletons, error boundary, empty states
- [ ] TanStack Query for all API calls
- [ ] Open PR to `main`

### Iris (Integrations) · `agent/integrations/v0.1-gmail-sheets`

**Branch from latest `main`.**

- [ ] `lib/nodemailer/transport.ts` — creates and exports a Nodemailer transporter using `GMAIL_USER` + `GMAIL_APP_PASSWORD` + `GMAIL_SENDER_NAME` from env. Exports `verifyConnection()` for health checks. Publish signature to CONTRACTS.md §5
- [ ] `lib/sheets/client.ts` — keep v1.0 Google Sheets service account auth (works)
- [ ] `lib/sheets/fetchRows.ts` — keep v1.0 `fetchSheetRows` function (works). Update column auto-detect to include `headline`, `location`, `application_date` header variants
- [ ] Publish `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_SENDER_NAME` env vars to CONTRACTS.md §1 if not already there
- [ ] Open PR to `main`

### Integration points

1. **Basil publishes CONTRACTS.md §2 + §4 first** → unblocks Fern
2. **Iris publishes Nodemailer transport signature to CONTRACTS.md §5** → unblocks Basil's `lib/email/sender.ts`
3. **Iris's `fetchSheetRows` already exists on main** — Basil imports it in the import route
4. **Merge order: Iris → Basil → Fern** (Basil depends on Iris's transport; Fern depends on Basil's types + routes)

---

## v0.2 and later

Work specs drafted by Orion when v0.1 merges. Do not draft yet.

---

## Blockers / Decisions Needed

- **v0.1 code pivot** — existing v0.1 code (Drizzle schema, NextAuth, API routes, Frontend UI) was built against PRD v1.0 (manual Kanban dashboard + Resend). Schema, routes, and UI need significant modification for PRD v2.1 (Gmail SMTP, evaluation engine, campaign-based workflow). Orion to decide: modify existing code or start fresh on a new branch.

---

## Changelog

- 2026-04-16 — Project started under PRD v1.0; v0.1 scaffold + schema + frontend + sheets integration built and merged (PRs #1–#8)
- 2026-04-17 — **Major pivot**: user provided PRD v2.1 (LinkedIn Automation Agent, email-first). PhantomBuster replaced with free ApplicantSync Chrome extension. Resend replaced with Gmail SMTP + Nodemailer. BullMQ/Redis replaced with DB email queue + UptimeRobot cron. All reference docs (BUILD_PLAN, CONTRACTS, PROGRESS, DEPLOYMENT, .env.example, README) reset for v2.1. Total cost reduced from ~$76-91/mo to **$0/mo**.
