# A4G Recruitment Automation — Progress Tracker

Single source of truth for **what's being built right now** and **what's done**. Updated by the Orchestrator every time a version starts, a PR merges, or a blocker appears. Build versions and agent roles are defined in `BUILD_PLAN.md`.

---

## Current Version

**v0.1 — Foundation** · Status: `in progress — orchestrator scaffold landed, agents unblocked`

---

## Version Status Overview

| Version | Phase (PRD §19) | Status | Started | Completed |
|---|---|---|---|---|
| v0.1 | Foundation | not started | — | — |
| v0.2 | Kanban read-only | blocked on v0.1 | — | — |
| v0.3 | Drag-drop stage transitions | blocked on v0.2 | — | — |
| v0.4 | Email subsystem | blocked on v0.3 | — | — |
| v0.5 | Email enrichment | blocked on v0.4 | — | — |
| v0.6 | Bulk actions + automation | blocked on v0.4 | — | — |
| v0.7 → v1.0 | Polish + compliance | blocked on v0.6 | — | — |

---

## v0.1 — Foundation · Work Specs

**Demo criteria (must all pass before v0.1 merges):**

- [ ] `npm run dev` starts the app locally without errors
- [ ] `/login` accepts the admin credentials stored in `.env.local`
- [ ] `/dashboard` shows an "Import candidates" button and an empty state when no candidates exist
- [ ] Clicking import, pasting a Google Sheet URL, confirming the column mapping, and submitting imports all rows as candidate records
- [ ] After import, `/dashboard` shows the candidates in a shadcn Table with name, email, LinkedIn URL, role, stage
- [ ] Data persists across a server restart (Neon connection works)
- [ ] Every write emits an `audit_log` row

### Orchestrator · `agent/orchestrator/v0.1-bootstrap`

- [x] Initialise Next.js 15 App Router project with TypeScript, Tailwind, ESLint at repo root (Next 15.5.15, Tailwind v4, ESLint v9, Turbopack dev/build)
- [x] Initialise shadcn/ui — `components.json` + `lib/utils.ts` written manually (Tailwind v4 config, `new-york` style, `slate` base, `@/` alias). Backend to `npm install` + `npx shadcn@latest add <component>` as needed
- [ ] Create Neon project, obtain `DATABASE_URL`, add to `.env.local` — **owner to do in UI per DEPLOYMENT.md §2**
- [ ] Create Vercel project, link to the repo, import Neon integration — **owner to do in UI per DEPLOYMENT.md §3**
- [x] Populate `.env.example` with the full env var list from `CONTRACTS.md` (v0.1 active; v0.4–v0.7 vars commented out and will be uncommented per-version)
- [x] Create `DEPLOYMENT.md` with step-by-step Neon + Vercel + Google service account setup
- [x] Set up GitHub repo — remote wired to `A4Gcollab/Recruitment-automation`, repo-level identity locked to `SnehaChouksey`, `.githooks/pre-commit` enforces identity, credential helper bridges to `gh.exe` keyring, initial commit `456395b` pushed to `main`, branch protection ruleset `protect-main` active on `main` (PR required, 0 approvals, force-push + deletion blocked).
- [ ] Set up basic CI: typecheck + lint on PR — Orchestrator to ship `.github/workflows/ci.yml` on a small PR, then owner toggles *Require status checks to pass* in ruleset `protect-main` and selects the workflow jobs.
- [ ] After Backend agent publishes schema and API surface, Frontend + Integrations can start in parallel
- [ ] Demo check at end: run all demo criteria above; only merge when all pass

### Backend · `agent/backend/v0.1-schema`

- [ ] Install Drizzle + `drizzle-kit` + `postgres` driver
- [ ] Write schema in `db/schema.ts` for all 7 tables from PRD §6: candidates, campaigns, email_templates, email_events, scheduled_sends, stages, audit_log. Include every column, constraint, FK, and index listed in the PRD
- [ ] Configure `drizzle.config.ts`; add `db:generate`, `db:migrate`, `db:studio` scripts
- [ ] Write initial migration and a seed script for the 9 Kanban stages (see PRD §10.2) and the 4 default email templates (Stage-1, Stage-2, rejection, reminder — placeholders are fine; real bodies land in v0.4)
- [ ] Install NextAuth v5; configure credentials provider reading `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` from env; JWT session; protect `/dashboard`, `/kanban`, all `/api/*` except `/api/auth` and `/api/webhooks/*`
- [ ] Helper `lib/audit.ts` with `logAudit({ actor, action, entityType, entityId, before, after, metadata })` — every mutating API route must call this
- [ ] Implement `GET /api/candidates` — paginated, returns candidate list with filter params (stubbed OK — real filters land in v0.2)
- [ ] Implement `POST /api/candidates/import` — payload: `{ google_sheet_url, campaign_id, column_mapping }`; response: `{ imported: number, skipped: number, errors: Array<{ row, reason }> }`
- [ ] Publish all endpoint signatures to `CONTRACTS.md` **before** writing Frontend-visible logic
- [ ] Open PR to `main` with migration files, schema, API routes, auth config

### Frontend · `agent/frontend/v0.1-dashboard`

- [ ] Wait for Backend agent to publish `GET /api/candidates` and `POST /api/candidates/import` contracts in `CONTRACTS.md`
- [ ] Install TanStack Query, add the QueryClient provider in `app/layout.tsx`
- [ ] `/login` page with shadcn Card + Input + Button; submits credentials via NextAuth; redirects to `/dashboard` on success
- [ ] `/dashboard` page (protected via middleware); renders `Import` button in header; loads candidates via TanStack Query
- [ ] Import modal (shadcn Dialog) with three steps: (1) paste Google Sheet URL, (2) preview first 5 rows + pick column mapping, (3) confirm and show progress; on success, invalidate the candidates query and show a Toast with counts (`imported / skipped / errors`)
- [ ] Candidate table (shadcn Table): name, email, linkedin_url, role, stage. Empty state with CTA to import
- [ ] Loading skeletons, error boundary with retry, unauthenticated redirect
- [ ] Open PR to `main`

### Integrations · `agent/integrations/v0.1-sheets`

- [ ] Install `google-spreadsheet` (v4) + `google-auth-library`
- [ ] `lib/sheets/client.ts` — `getSheet(url)` using service account auth via `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` env vars
- [ ] `lib/sheets/fetchRows.ts` — `fetchSheetRows({ url, mapping, batchSize = 100 })` returning normalised rows; handles pagination and malformed rows by collecting them into an `errors` array
- [ ] Column auto-detect heuristic: map common header variants (`Name`/`Full Name`/`Candidate Name` → full_name; `Email`/`Email Address` → email; `LinkedIn`/`LinkedIn URL`/`Profile URL` → linkedin_url) and return suggested mapping for the UI preview
- [ ] Write the "Create a Google Service Account" section of `DEPLOYMENT.md` with the exact Google Cloud Console steps + how to share the sheet with the service account email
- [ ] Publish required env vars to `CONTRACTS.md` under "External Services → Google Sheets"
- [ ] Backend imports `fetchSheetRows` inside `POST /api/candidates/import` — coordinate via PR review

### Integration points between agents

1. **Backend publishes to `CONTRACTS.md` first** (endpoints + payload shapes) → unblocks Frontend.
2. **Integrations publishes env vars and the `fetchSheetRows` function signature** to `CONTRACTS.md` → unblocks Backend's import route implementation.
3. **Frontend and Integrations can merge in either order** once Backend is in.
4. **Orchestrator runs the demo check** and merges the final PR that flips the version to `shipped`.

---

## v0.2 and later

Work specs will be drafted here by the Orchestrator when v0.1 merges. Do not draft them yet — scope may shift based on what v0.1 surfaces.

---

## Blockers / Decisions Needed

- ~~**Frontend v0.1 blocked on Orchestrator bootstrap**~~ — _resolved 2026-04-16 by Orchestrator._ Scaffold + git repo + shadcn config landed in commit `456395b` on `main`. Frontend unblocked.
- **Frontend v0.1 also needs Backend auth wiring before `/login` is meaningfully testable** — _raised 2026-04-16 by Frontend agent._ NextAuth v5 credentials provider, `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` handling, and `/api/auth/[...nextauth]` are on the Backend checklist. Frontend can build the form against the documented contract, but end-to-end login verification requires the Backend PR to land first. Not strictly blocking UI work — noted so Orchestrator can sequence merge order.
- ~~**Branch protection on `main`**~~ — _resolved 2026-04-16 by owner._ Ruleset `protect-main` (id `15151875`) is **active** on `refs/heads/main` with: `deletion` blocked, `non_fast_forward` (force-push) blocked, `pull_request` required with `required_approving_review_count = 0` (solo-owner flow — agents push to feature branches, open a PR, merge with one click). `dismiss_stale_reviews_on_push = true` is set for when reviewers are added later.
- **CI (typecheck + lint on PR)** — Orchestrator to add `.github/workflows/ci.yml` once branch protection is enabled so the workflow can be set as a required status check.
- **Neon project + Vercel project** — need to be created by the owner. Steps in `DEPLOYMENT.md` §2 and §3. Paste resulting `DATABASE_URL` into `.env.local` (local) and Vercel Project Settings (production).

---

## Changelog

- 2026-04-16 — BUILD_PLAN.md and PROGRESS.md initialised; v0.1 work specs drafted
- 2026-04-16 — Frontend agent started v0.1; flagged blocker: Next.js scaffold + git repo not yet initialised by Orchestrator; contract gate for candidates endpoints is cleared in CONTRACTS.md §2
- 2026-04-16 — git repo initialised; remote wired to `A4Gcollab/Recruitment-automation`; repo-level identity set to `SnehaChouksey <snehachoukseyobc@gmail.com>`; pre-commit identity hook installed at `.githooks/pre-commit`; credential helper at `scripts/git-credential-gh.sh` bridges WSL git to the Windows `gh.exe` keyring; initial commit `456395b` pushed to `main`. Scaffold (Next.js 15.5.15 App Router + Tailwind v4 + ESLint + shadcn config), `.env.example`, and `DEPLOYMENT.md` shipped in the same commit. Branch protection request blocked on admin permission — logged under Blockers.
- 2026-04-16 — Branch protection on `main` enabled by owner. Ruleset `protect-main` (id `15151875`) is active: PR required to merge (0 approvals), force-push blocked, deletion blocked, stale reviews dismissed on push. Agents must now open PRs from their `agent/<role>/v0.1-*` branches; direct pushes to `main` will be refused by GitHub.
