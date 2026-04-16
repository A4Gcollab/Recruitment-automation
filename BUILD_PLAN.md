# A4G Recruitment Automation — Build Plan

This document maps the PRD (see `PRD.md`) into discrete build versions and defines the multi-Claude agent setup that builds each one. It is the authoritative plan. Update this file only when the plan itself changes — use `PROGRESS.md` for status.

Last updated: 2026-04-16

---

## 1. The Multi-Agent Model

Built on top of the tmux + WSL pattern from `docs/multi-claude-setup-guide.md`. You run up to **4 panes**, each being a Claude Code instance with a scoped role, started via `~/claude-session.sh a4g 4`.

| Pane | Agent Role | Owns |
|---|---|---|
| 0 (left) | **Orchestrator** | Reads PRD, writes per-version work specs into `PROGRESS.md`, reviews PRs from other agents, merges to `main`, runs demo-criteria checks, keeps `CONTRACTS.md` authoritative |
| 1 | **Backend agent** | Drizzle schema + migrations, Next.js Route Handlers, server-side validation, NextAuth, webhook handlers, the safety dispatcher, scheduled_sends logic |
| 2 | **Frontend agent** | Next.js pages/components, Tailwind + shadcn/ui, Kanban board, forms, optimistic updates with TanStack Query |
| 3 | **Integrations agent** | External service glue: Google Sheets ingest, Resend (send + webhook verify + React Email templates), Snov.io enrichment, Vercel Cron, UptimeRobot |

### Coordination protocol

- **One git repo**, one `main` branch.
- Each agent works on a branch named `agent/<role>/v<version>-<slice>` (e.g. `agent/backend/v0.1-schema`).
- Orchestrator holds `main` and merges PRs only when the version's demo criteria pass.
- **Shared contract files at repo root**: `PROGRESS.md`, `CONTRACTS.md`, `.env.example`.
- API contracts are authored by the **Backend agent first**, then Frontend implements against them. Integrations publishes webhook payload shapes and external env vars to `CONTRACTS.md`.
- No agent edits another agent's primary surface area without a handoff note in `PROGRESS.md`.

---

## 2. Build Versions

Each version is independently demoable. Maps 1:1 to PRD §19 phases.

### v0.1 — Foundation (PRD Phase 1)

**Demoable**: HR logs in, imports a Google Sheet, sees candidates in a plain table.

| Agent | Scope |
|---|---|
| Orchestrator | Scaffold Next.js 15 repo, set up Neon DB + Vercel project, write `CONTRACTS.md` v0, define env var list, populate `.env.example`, write `PROGRESS.md` checklist |
| Backend | Drizzle schema (all 7 tables per PRD §6), migration runner, seed the 9 stages, `GET /api/candidates`, `POST /api/candidates/import`, NextAuth v5 credentials provider, `audit_log` helper |
| Frontend | `/login`, `/dashboard` table view, Import modal with column mapping step, shadcn Table + Dialog + Toast, loading and error states |
| Integrations | `google-spreadsheet` v4 wrapper, service account auth, `fetchSheetRows(url, mapping)`, batch-100 import, column auto-detect heuristic |

### v0.2 — Kanban read-only (PRD Phase 2)

**Demoable**: Pipeline visualised as 9 columns with counts and filters.

| Agent | Scope |
|---|---|
| Backend | `GET /api/candidates?stage=&role=&has_email=&date_range=` with pagination, `GET /api/stages` |
| Frontend | `/kanban` page, 9-column grid, candidate card component, filter bar, empty states, loading skeletons |
| Integrations | Idle |

### v0.3 — Drag-drop stage transitions (PRD Phase 3)

**Demoable**: HR drags a card between columns, change persists, audit log entry written.

| Agent | Scope |
|---|---|
| Backend | `POST /api/candidates/[id]/stage` with transition validation + audit log entry; optimistic-lock via `updated_at` |
| Frontend | @dnd-kit integration, optimistic update with TanStack Query, rollback on error, 5-second undo toast |
| Integrations | Idle |

### v0.4 — Email subsystem (PRD Phase 4) — **biggest version**

**Demoable**: Stage-1 email sends to one candidate in dry-run, then live; delivery status updates on the card.

| Agent | Scope |
|---|---|
| Backend | Template engine with variable substitution, `dispatchEmail()` safety wrapper (window check + daily cap + delay), `POST /api/emails/send`, `POST /api/webhooks/resend` with signature verify, `email_events` writes, kill-switch env flag |
| Frontend | Card detail drawer with email timeline, "Send Stage-1" button with dry-run toggle, live status badges (queued/sent/delivered/bounced/opened) |
| Integrations | Resend API client, domain verification + SPF/DKIM/DMARC guide in `DEPLOYMENT.md`, webhook URL registration, React Email templates for Stage-1, Stage-2, rejection, reminder |

### v0.5 — Email enrichment (PRD Phase 5)

**Demoable**: "Enrich email" button on a card with a LinkedIn URL fills in the email from Snov.io.

| Agent | Scope |
|---|---|
| Backend | `POST /api/candidates/[id]/enrich`, `POST /api/candidates/enrich-bulk`, credit tracking, 7-day cache of Snov lookups to avoid burning credits |
| Frontend | Enrich button on card, bulk-enrich toolbar action, credit-used indicator |
| Integrations | Snov.io client wrapper, Apollo.io fallback behind a feature flag |

### v0.6 — Bulk actions + automation (PRD Phase 6)

**Demoable**: Select 50 cards → send Stage-1 to all. System auto-sends a reminder 20 hours later.

| Agent | Scope |
|---|---|
| Backend | `POST /api/emails/send-bulk` with confirmation token, `scheduled_sends` writer, `GET /api/cron/process-scheduled-sends` cron handler, retry policy with backoff, idempotency keys |
| Frontend | Multi-select on Kanban cards, bulk-action toolbar, confirmation modal with dry-run preview, scheduled-send indicator on cards |
| Integrations | Vercel Cron config in `vercel.json`, reminder-trigger logic (20h after stage1_sent if no submission) |

### v0.7 — Polish + compliance (PRD Phase 7) → ships as **v1.0**

**Demoable**: Two-way Sheet sync, unsubscribe flow, GDPR erasure, bounce alerting, audit log page.

| Agent | Scope |
|---|---|
| Backend | `POST /api/candidates/[id]/erase` (GDPR), `GET /api/audit-log`, bounce-rate threshold alert logic, unsubscribe token generator + handler |
| Frontend | Audit log page with filters, unsubscribe landing page, GDPR erase confirmation |
| Integrations | Two-way Sheets sync writer (writes stage + sent_at back), UptimeRobot monitor for `/api/health`, `/api/health` endpoint, Resend bounce webhook → admin alert email |

---

## 3. Tmux kickoff

From WSL, inside the `D:/workspace/Linkedin-automation` checkout:

```
~/claude-session.sh a4g 4
```

Then paste the relevant **permanent role prompt** into each pane. These stay the same for every version — only the work spec in `PROGRESS.md` changes per version.

### Pane 0 — Orchestrator

> You are the Orchestrator for the A4G recruitment automation project. The PRD lives at `PRD.md` at repo root. The build plan lives at `BUILD_PLAN.md`. Your job: (1) for the current version, write a short per-agent work spec into `PROGRESS.md` and tag which agent picks it up; (2) review PRs from backend/frontend/integrations agents against the version's demo criteria; (3) merge to `main` only when demo criteria pass; (4) keep `CONTRACTS.md` authoritative — API signatures, webhook payloads, env vars. Do not write feature code yourself. Tell me which version we are on, then output the current version's work specs.

### Pane 1 — Backend

> You are the Backend agent for the A4G recruitment automation project. Stack: Next.js 15 Route Handlers + TypeScript + Drizzle + Neon Postgres + NextAuth v5. Read `PRD.md` sections 6 (Data Model), 7 (API Design), 11 (Safety), 12 (Background Jobs), 14 (Auth), 15 (Security). You own schema, migrations, API routes, auth, webhook handlers, and the safety dispatcher. Always publish API signatures to `CONTRACTS.md` before implementing so the Frontend agent can work in parallel. Work on branch `agent/backend/v<version>-<slice>`. Wait for the Orchestrator's work spec in `PROGRESS.md` before starting.

### Pane 2 — Frontend

> You are the Frontend agent for the A4G recruitment automation project. Stack: Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui + @dnd-kit + TanStack Query. Read `PRD.md` section 10 (Kanban Frontend). You own pages, components, forms, the Kanban board, optimistic updates, and client-side validation. Read API contracts from `CONTRACTS.md` — do not invent endpoints. Work on branch `agent/frontend/v<version>-<slice>`. Wait for the Orchestrator's work spec in `PROGRESS.md` before starting.

### Pane 3 — Integrations

> You are the Integrations agent for the A4G recruitment automation project. You own external service glue only: Google Sheets (`google-spreadsheet`), Resend (email send + webhook verify + React Email templates), Snov.io (enrichment), Vercel Cron, UptimeRobot. Read `PRD.md` sections 5 (Tech Stack), 8 (Email Subsystem), 9 (Enrichment), 12 (Background Jobs). Publish every external payload shape and env var to `CONTRACTS.md`. Work on branch `agent/integrations/v<version>-<slice>`. Wait for the Orchestrator's work spec in `PROGRESS.md` before starting.

---

## 4. Recommended pane count per version

| Version | Panes | Reason |
|---|---|---|
| v0.1 | 4 | All hands — scaffold + schema + UI + Sheets |
| v0.2 | 3 (skip Integrations) | Read-only board, no external calls |
| v0.3 | 3 (skip Integrations) | Pure DnD + API |
| v0.4 | 4 | Resend + webhooks is integration-heavy |
| v0.5 | 4 | Snov.io integration |
| v0.6 | 4 | Vercel Cron wiring |
| v0.7 | 4 | Sheets two-way + UptimeRobot |

---

## 5. Done definition (every version)

A version ships to `main` only when:

1. Its demo-criteria bullet (above) passes end-to-end on a dev machine.
2. All API routes in that version are listed in `CONTRACTS.md` with request/response shapes.
3. All new env vars are in `.env.example`.
4. `PROGRESS.md` is updated: version marked complete, next version's work specs drafted.
5. A short demo recording or checklist pasted into `PROGRESS.md` under that version's heading.
