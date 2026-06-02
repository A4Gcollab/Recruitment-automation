# Requirements v2.2 — Hybrid HR-Automation Pivot

**Source:** Stakeholder meeting, 2026-05-18 (Sneha, Sushma, Sir/Boss).
**Updated:** 2026-05-20 — corrected ApplicantSync architecture after verifying its free-tier behavior end-to-end.
**Replaces:** PRD v2.1 §6.3 (AI Evaluation Engine).
**Status:** Active — supersedes v2.1 evaluation plans.

---

## 1. The one-page scope (per Sir's request)

We are **NOT** building an AI evaluation engine inside the tool. Sushma will continue to use ChatGPT to evaluate candidates manually. The tool's job is to **move data in and out of ChatGPT fast** and **send bulk emails on her behalf** — that's it.

**Source of candidate data:** The free **ApplicantSync** Chrome extension. HR exports LinkedIn Easy Apply applicants → ApplicantSync asynchronously enriches each row over a few hours (name, email, phone, current title, current company, school, location, LinkedIn URL, applied date, resume URL, ApplicantSync's own JD-match score). HR exports the resulting CSV from ApplicantSync once enrichment is largely complete (~95%+), then imports it into our tool.

**The hybrid loop:**

```
HR Sushma                       Our Tool (ATS)                      Sushma + ChatGPT
─────────                       ───────────                         ─────────────────
ApplicantSync export
of LinkedIn applicants
(name, email, phone,
 title, company, school,
 location, LinkedIn URL,
 resume URL, score, …)
        │
        ▼ (paste CSV / Sheet URL)
                                Imports candidates
                                       │
                                       ▼
                                Exports candidate list
                                as a downloadable XLSX
                                       │
                                       ▼
                                                                    Sushma uploads XLSX
                                                                    to ChatGPT → asks it
                                                                    "who is a good fit,
                                                                     who is not, and why"
                                                                    → ChatGPT fills in
                                                                    two columns:
                                                                    `verdict` + `reason`
                                       ▼
                                Sushma re-uploads the
                                evaluated XLSX into
                                the tool
                                       │
                                       ▼
                                Tool stores verdict
                                + reason on each
                                candidate row
                                       │
                                       ▼
                                Sushma filters "good fit",
                                clicks "Send Google Form
                                to selected" → bulk
                                emails queued
                                       │
                                       ▼
                                Tool sends reminders to
                                candidates who haven't
                                responded in 3 days
                                       │
                                       ▼
                                When form responses come
                                in, tool exports them as
                                another XLSX
                                (includes original verdict
                                 + reason for context)
                                       │
                                       ▼
                                                                    Sushma uploads to
                                                                    ChatGPT → "who do
                                                                    we call for interview"
                                                                    → ChatGPT fills
                                                                    `interview_verdict`
                                       ▼
                                Sushma re-uploads
                                evaluated responses
                                       │
                                       ▼
                                Sushma filters "call for
                                interview", clicks "Send
                                interview link to selected"
                                → bulk emails queued
                                with HRBP's custom note
                                + Zoom link from campaign
                                       │
                                       ▼
                                Done.
```

**Time saved (Sushma's own estimate):**
- Current state: ~1 hour to manually send Google Form via LinkedIn DM, 1+ hour to find form-responders on LinkedIn and send interview links per role, plus indefinite hours for reminders.
- With this tool: ~50–70% reduction.

---

## 2. What is **IN** scope (v0.1 → v0.2 build)

These are the discrete features to build. Each one is a "story."

### 2.1 Import candidates from ApplicantSync CSV/Sheet *(extend v0.1)*

- HR pastes a Google Sheet URL **or** uploads a CSV exported from ApplicantSync.
- Tool reads rows → creates candidate records.
- Columns captured (full ApplicantSync export):
  - `full_name`, `email`, `phone`, `current_title`, `current_company`, `school`, `location`, `linkedin_url`, `applied_date`, `resume_url`, `applicantsync_score` (e.g. `"9/11"`)
  - Any extra columns (LinkedIn screening Q answers, when present on the job post) are stored in a JSONB `linkedin_data` bag — variable per role.
- Dedupe by email within the campaign.
- **v0.1 already handles** name/email/LinkedIn URL/headline/location/application_date. v0.2 adds the rest.

### 2.2 Export candidate list for ChatGPT evaluation *(NEW — v0.2)*

- On the campaign page, "Export for evaluation" button → downloads an **XLSX** file (Excel).
- Columns (one row per candidate):
  - Identity: `name`, `email`, `linkedin_url`, `phone`
  - Profile: `current_title`, `current_company`, `school`, `location`, `applicantsync_score`, `resume_url`
  - LinkedIn screening Q answers from `linkedin_data` (each as its own column)
  - Empty: `verdict`, `reason`
- Sushma uploads to ChatGPT, asks for evaluation, ChatGPT fills the two empty columns. The resume URL lets ChatGPT optionally read the actual resume PDF for richer context.

### 2.3 Re-import evaluated XLSX *(NEW — v0.2)*

- "Import evaluations" button on the campaign page.
- HR uploads the XLSX ChatGPT filled in (verdict + reason populated).
- Tool matches rows by email (primary) or LinkedIn URL (fallback).
- Writes `verdict` (`good_fit` / `not_fit` / null) and `reason` (free text) onto each candidate row.
- Candidate stage advances to `evaluated_screen1`.

### 2.4 Bulk send Google Form email *(NEW — v0.2)*

- Candidates table gets row checkboxes + "Select all good_fit" filter.
- "Send Google Form to selected" button.
- One configurable template per campaign — HRBP fills in:
  - Email subject
  - Email body (merge fields: `{{name}}`, `{{form_link}}`, `{{deadline}}`)
  - Google Form URL (already on campaign)
- Clicking the button queues N emails (one per selected candidate) through the existing rate-limited queue (9am–8pm IST, 20/hr cap, 30–60s gaps).
- Each candidate's stage advances to `stage1_sent`.

### 2.5 Automated reminders to non-responders *(NEW — v0.2)*

- Configurable per campaign: "send reminder if no form response within N days" (default **3**).
- A daily cron checks every candidate with `stage1_sent` whose `stage1_sent_at < now() - N days` and who has not advanced to `form_submitted`.
- Sends a reminder email using a separate (configurable) template.
- Stage advances to `reminder_sent` (only one reminder per candidate, then stops).

### 2.6 Form-response intake *(NEW — v0.2)*

- Each campaign points to a Google Form, and that form writes responses to a Google Sheet (Forms → Responses → linked Sheet).
- "Pull form responses" button reads that sheet and attaches each response to the matching candidate (match by email — Form must ask for email).
- Stage advances to `form_submitted`.

### 2.7 Export form responses for second evaluation *(NEW — v0.2)*

- "Export responses for evaluation" button → downloads an **XLSX**.
- One row per form-submitted candidate, with:
  - Identity: `name`, `email`, `linkedin_url`
  - Original first-round context: `verdict`, `reason` (so ChatGPT has the prior good-fit rationale when judging interview eligibility)
  - All form question answers, one per column
  - Empty: `interview_verdict`, `interview_reason`

### 2.8 Re-import interview verdicts *(NEW — v0.2)*

- Same flow as 2.3 — uploads ChatGPT's filled XLSX.
- Writes `interview_verdict` (`call_interview` / `reject` / null) + `interview_reason` onto candidate rows.
- Stage advances to `evaluated_screen2`.

### 2.9 Bulk send interview link *(NEW — v0.2)*

- "Send interview link to selected" button (filter by `interview_verdict = call_interview`).
- HRBP-customizable template per campaign:
  - Subject
  - Body (merge fields: `{{name}}`, `{{interview_date}}`, `{{interview_time}}`, `{{zoom_link}}`, `{{zoom_meeting_id}}`, `{{zoom_passcode}}`, plus a free-text **HRBP note**)
- Sends in bulk through the rate-limited queue.
- Stage advances to `interview_link_sent`.

### 2.10 HRBP-customizable templates *(NEW — v0.2)*

- The Stage-1 (Google Form) email, reminder email, and interview-link email are **per-campaign**, not hardcoded.
- When HR creates a campaign, the create-campaign dialog accepts:
  - Stage-1 subject + body
  - Reminder subject + body
  - Interview-link subject + body
- Sensible defaults pre-filled (HR can edit before saving).

---

## 3. What is **OUT** of scope (explicitly cut)

| Cut feature | Why |
|---|---|
| AI evaluation engine inside the tool (Tier 1 / Tier 2 scoring, PASS/FAIL/REVIEW) | Sushma will use ChatGPT manually. Building it ourselves costs Sneha skill-building time we don't have right now. |
| ChatGPT API integration | Token costs too high. ChatGPT stays manual (Sushma's own browser session). |
| LinkedIn DM sending | All outreach is **email-only** now. ApplicantSync stays as the LinkedIn → Sheet importer, but no DMs sent from the tool. |
| JD creation automation | HRBPs continue to create JDs manually. Not the priority. |
| Gmail reply detection (auto-advance on "Yes I'm in" replies) | Was v0.3 in old plan — deferred until a new hire joins. |
| Tracker sheet auto-sync back to Google Sheets | Was v0.4 in old plan — deferred. |
| Anti-gravity / on-device LLM workflow | Mentioned as an option for the future. Not v0.2. |

---

## 4. Data model deltas (vs current v0.1 schema)

Already in v0.1: `campaigns`, `candidates`, `role_configs`, `email_queue`, `stages`, `audit_log`.

**Additions / changes for v0.2:**

- **`candidates`** — add columns:
  - From ApplicantSync export (currently discarded):
    - `phone` (varchar 50)
    - `current_title` (varchar 255)
    - `current_company` (varchar 255)
    - `school` (varchar 255)
    - `resume_url` (text)
    - `applicantsync_score` (varchar 20) — e.g. `"9/11"`
    - `linkedin_data` (JSONB) — bag for any extra ApplicantSync columns (LinkedIn screening Q answers when the job has custom ones)
  - For the ChatGPT loop:
    - `verdict` (varchar: `good_fit` / `not_fit` / null)
    - `reason` (text)
    - `interview_verdict` (varchar: `call_interview` / `reject` / null)
    - `interview_reason` (text)
  - For the reminder cron:
    - `stage1_sent_at` (timestamptz)
    - `reminder_sent_at` (timestamptz)
- **`form_responses`** — new table:
  - `id`, `candidate_id` (FK), `campaign_id` (FK), `responses` (JSONB of question → answer), `submitted_at`, `created_at`
- **`campaigns`** — add columns for HRBP-customizable templates:
  - `stage1_subject`, `stage1_body`
  - `reminder_subject`, `reminder_body`
  - `interview_subject`, `interview_body`
  - `reminder_after_days` (default 3)
- **`stages` seed update** — add new stages:
  - `evaluated_screen1` (after Sushma re-imports ChatGPT's good-fit verdict)
  - `reminder_sent`
  - `evaluated_screen2` (after Sushma re-imports ChatGPT's interview verdict)
  - `interview_link_sent`

---

## 5. UI deltas (vs current v0.1 dashboard)

**Campaign list page** — no change.

**Create-campaign dialog** — add fields for 3 email templates (Stage-1, reminder, interview-link) with sensible defaults pre-filled.

**Campaign detail page (candidates table)** — add:
- Row checkboxes + "select all," "select all good_fit," "select all call_interview"
- Filter chips: All / Imported / Good Fit / Not Fit / Stage-1 Sent / Form Submitted / Call for Interview / Interview Link Sent
- Top-bar buttons (conditional on selection / stage filter):
  - **Export for evaluation** (always available — downloads XLSX)
  - **Import evaluations** (always available — opens file picker for XLSX)
  - **Send Google Form to selected** (enabled when good_fit candidates are selected)
  - **Pull form responses** (enabled when there are stage1_sent candidates)
  - **Export responses for evaluation** (XLSX)
  - **Import interview verdicts** (XLSX)
  - **Send interview link to selected**
- Each row shows: name, email, LinkedIn, current stage, verdict (chip), interview_verdict (chip)
- Click a row → side panel shows full reason + form responses + resume link if any

---

## 6. Stage machine

```
imported
   │
   ▼ (Sushma imports ChatGPT evaluation)
evaluated_screen1   ──► (verdict = not_fit) → rejected_screen1
   │ (verdict = good_fit)
   ▼ (Sushma clicks "Send Google Form to selected")
stage1_sent
   │ ──── 3 days no response ────► reminder_sent ── still no response ──► dropped
   ▼ (candidate fills form)
form_submitted
   │
   ▼ (Sushma imports ChatGPT interview verdict)
evaluated_screen2   ──► (interview_verdict = reject) → rejected_screen2
   │ (interview_verdict = call_interview)
   ▼ (Sushma clicks "Send interview link to selected")
interview_link_sent
   │
   ▼ (manual / future automation)
interview_confirmed
```

---

## 7. Build order (proposed)

1. **Schema migration** — add new columns to `candidates`, `campaigns`; create `form_responses`; add new stages. *(Basil)*
2. **Extend import** — capture the new ApplicantSync columns (phone, current_title, current_company, school, resume_url, applicantsync_score, linkedin_data) on `POST /api/campaigns/[id]/import`. *(Basil + Iris — Iris updates `fetchSheetRows` to surface extras, Basil updates the route)*
3. **Bulk export endpoints (XLSX)** — `GET /api/campaigns/[id]/export-candidates`, `GET /api/campaigns/[id]/export-responses`. *(Basil)*
4. **Bulk import endpoint** — `POST /api/campaigns/[id]/import-evaluations` (handles both Screen-1 and Screen-2 evaluations based on a `type` query param). *(Basil)*
5. **Bulk send endpoint** — `POST /api/campaigns/[id]/send-bulk` (body: `template_type`, `candidate_ids[]`). Queues N emails. *(Basil)*
6. **Reminder cron** — extend `app/api/cron/process-queue` to also queue reminder emails for candidates past the threshold. *(Basil)*
7. **Pull form responses** — `POST /api/campaigns/[id]/pull-responses` (reads linked response sheet, attaches answers to candidates). *(Iris + Basil)*
8. **UI** — extend create-campaign dialog with template fields; add checkboxes + filter chips + bulk action buttons + side panel to candidates table. *(Fern)*
9. **Defaults** — seed sensible default templates for the 3 emails so new campaigns work out of the box. *(Basil)*

---

## 8. Locked decisions (confirmed by Sneha, 2026-05-18 / 2026-05-20)

- **Export/import file format:** **XLSX (Excel)**. Sushma works in Excel; XLSX preserves formatting and column types better than CSV for ChatGPT round-trips.
- **Candidate data source:** **ApplicantSync** Chrome extension (free tier). Enrichment is asynchronous — HR exports after ~95%+ of rows are filled.
- **Second-round XLSX** (post-Google-Form): must include the candidate's form responses *plus* the prior `verdict` + `reason` (so ChatGPT sees the original good-fit/not-fit context when deciding interview eligibility).
- **Reminder cadence:** every 3 days, max 1 reminder per candidate.
- **Email matching for form responses** — Google Form must ask for candidate's email as the first question. We match by that email.
- **Per-campaign templates** — one set of templates per campaign (one role = one HRBP's templates).
- **Resume URLs** captured from ApplicantSync (Supabase-hosted PDFs) — included in XLSX export so ChatGPT can read resume content for richer evaluation.

---

## 9. Out of scope for this doc (the "how" — for AI consumption)

Sir distinguished between the **scope** (this doc) and the **detailed how** ("AI consumption"). The detailed how — API request/response shapes, exact DB column types, exact UI component hierarchy — will be written up next, after we agree on this scope.
