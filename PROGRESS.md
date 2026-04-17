# A4G LinkedIn Recruitment Automation — Progress Tracker

Single source of truth for **what's being built right now** and **what's done**. Updated by Orion (Orchestrator) when a version starts, a PR merges, or a blocker appears. Build versions and agent roles in `BUILD_PLAN.md`. PRD in `PRD_v2.1.md`.

---

## Current Version

**v0.1 — Foundation + Stage-1 Email** · Status: `not started`

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

_Per-agent work specs to be drafted by Orion when v0.1 starts._

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
