# PRD v0.4 — Candidate Profile, Manual Stage Move & LinkedIn Screening
**A4G Impact Collaborative — Recruitment Automation Platform**
**Status:** Draft for review
**Date:** 2026-06-19
**Branch:** feature/candidate-profile (to branch from feature/whatsapp-integration)

---

## 1. Problem Statement

The current candidates table shows a flat list. HRs have no way to:
1. See a complete profile of a candidate (contact, experience, education, LinkedIn screening answers, Google Form responses) in one place
2. Manually move a candidate to any pipeline stage without triggering an action (email/WA send)
3. See the LinkedIn screening Q&A that ApplicantSync shows in its own UI — that data does not appear anywhere in our dashboard despite being importable

This means HRs still rely on ApplicantSync as their primary review surface. The goal of this PRD is to make our dashboard the single place for all candidate evaluation and pipeline management.

---

## 2. Reference UI

ApplicantSync's candidate profile (from screenshots) is the design reference. It shows:

**List card (collapsed):**
- Avatar initials, Name, Screening score badge (e.g. "21/22 Q's"), LinkedIn Rating badge (Good Fit / Disqualified)
- Current role at company, headline/skills, university + degree, location, applied date
- Contact icons (email, phone, LinkedIn), action buttons (review status dropdown, Notes, Resume)

**Expanded profile sections:**
- Header: same as card + collapse arrow
- 3 info cards: Contact | LinkedIn Rating | Applied For
- AI Candidate Rank (we will replace this with our own verdict/screening section)
- Work Experience (1+ entries with role, company, location, date range)
- Education (card grid — degree, university, years)
- Screening Questions (collapsible, 3-col grid of Q1…Qn cards with question text + Yes/No answer in bold)

---

## 3. Scope

### In scope (v0.4)

| # | Feature |
|---|---------|
| F1 | Candidate profile drawer — right-side slide-over panel |
| F2 | Manual stage move — dropdown on table row and in profile drawer |
| F3 | LinkedIn Screening Q&A display — parse from `linkedin_data` JSONB |
| F4 | LinkedIn Rating badge — derive from `Status` CSV column |
| F5 | Google Form Responses section in profile |
| F6 | Fix CSV import — map `Status` column to `linkedin_fit` field |
| F7 | LinkedIn direct export import — new import flow for Q&A-bearing CSV |

### Out of scope (v0.4)

- Resume PDF viewer in-dashboard (link out to resume_url only)
- Work Experience / Education from parsed resume (we only have current_title / school)
- AI candidate ranking / scoring
- Multi-user comments or notes threading

---

## 4. Data Available Today

The `candidates` table already holds:

| Field | Source | Where shown |
|-------|--------|-------------|
| `full_name` | Import | Profile header |
| `email` | Import | Contact card |
| `phone` | Import | Contact card |
| `location` | Import | Contact card |
| `linkedin_url` | Import | Header icon |
| `current_title` | ApplicantSync "Title" | Work Experience |
| `current_company` | ApplicantSync "Company" | Work Experience |
| `school` | ApplicantSync "School" | Education |
| `resume_url` | ApplicantSync "Resume URL" | Resume button |
| `applicantsync_score` | ApplicantSync "Screening Score" e.g. "21/22" | Score badge |
| `headline` | LinkedIn export headline | Sub-header |
| `application_date` | ApplicantSync "Applied Date" | Header |
| `stage` | Pipeline | Stage badge + move dropdown |
| `verdict` / `reason` | ChatGPT screen | Verdict section |
| `linkedin_data` (JSONB) | All unmapped columns from import | Screening Q&A grid |
| `form_responses` (table) | Google Form pull | Form Responses section |

### Missing data — LinkedIn `Status` column

The ApplicantSync CSV has a `Status` column with values: `new`, `reviewed`, `disqualified`.
This is NOT currently mapped to any typed field — it falls into `linkedin_data` JSONB.
**Fix:** map "Status" → `linkedin_fit` varchar column in schema.

### Missing data — Screening Q&A text

ApplicantSync's basic CSV export (`applicants-2026-06-19.csv`) only exports:
```
Screening Score: "21/22"
```
It does NOT export the individual question text or Yes/No answers.

**How to get Q&A:** Export directly from LinkedIn (Job Management → Manage Applicants → Download). This CSV has one column per screening question, with candidate answers as column values. This is the same format as the mentor's `Software Developer — Sheet1.csv`.

When the HR imports this LinkedIn-direct CSV, all question columns land in `linkedin_data` JSONB via the existing `raw` capture. The profile drawer reads them from there.

---

## 5. Feature Specifications

---

### F1 — Candidate Profile Drawer

**Trigger:** Click anywhere on a candidate row in the candidates table (except checkboxes and action buttons).

**Behaviour:** A right-side drawer (`Sheet` component from shadcn/ui) slides in at ~60% viewport width, without navigating away. The table remains visible on the left. The drawer is closeable via X button or pressing Escape.

**URL:** Update the URL query param `?candidate=<id>` on open so the drawer can be deep-linked (browser back closes it).

**Drawer layout (top to bottom):**

#### 5.1 Profile Header

```
[Avatar initials]  [Name]  [21/22 Q's badge]  [Good Fit / Disqualified badge]
                   [Current Title] at [Current Company]
                   [Headline / skills snippet]
                   [School · Degree]
                   [Location]  [Applied: date]  [email icon] [phone icon] [LinkedIn icon]

[Resume button]  [Stage dropdown ← F2]  [Notes button]
```

- **Avatar:** 56px circle, initials from `full_name`, colour derived from name hash (same palette as existing StageBadge)
- **Score badge:** `applicantsync_score` formatted as "21/22 Q's"; amber background. Hidden if null.
- **LinkedIn Rating badge:** derived from `linkedin_fit` field (see F4). "Good Fit" = green outline; "Disqualified" = red filled; "Reviewed" = grey; absent if null.
- **Resume button:** opens `resume_url` in new tab. Hidden if null.

#### 5.2 Info Cards Row (3 cards, equal width)

**Card 1 — Contact**
- Email (teal, mailto link)
- Phone (teal, tel link)
- Location (grey, pin icon)

**Card 2 — LinkedIn Rating**
- Large badge: "Good Fit" (green) / "Disqualified" (red) / "Reviewed" (grey)
- If no `linkedin_fit` data: show "—"

**Card 3 — Applied For**
- Role name (teal, links to campaign's `job_post_url` if set)
- "at A4G Impact Collaborative"

#### 5.3 Verdict Section (existing ChatGPT screen data)

Only shown if `verdict` is set. Shows:
- Verdict badge (Good Fit / Not Fit)
- Reason text (collapsible if > 3 lines)
- Interview verdict + reason (if set)

#### 5.4 Work Experience

Section heading "Work Experience (1)" with briefcase icon.

Single entry card:
- **Role:** `current_title` (bold)
- **Company:** `current_company`
- No date range (we don't have it from the CSV)

Hidden if both `current_title` and `current_company` are null.

#### 5.5 Education

Section heading "Education (1)" with graduation cap icon.

Single entry card:
- **School:** `school`
- No degree details (we only have the school name from ApplicantSync)

Hidden if `school` is null.

#### 5.6 Screening Questions

Section heading "Screening Questions" + score badge + LinkedIn Rating badge (same as header).
Collapsible (default: expanded).

**Source:** `linkedin_data` JSONB — any key whose value is "Yes", "No", "yes", "no", or a short answer. Keys that are NOT question-like (e.g. "Status", "S no", "Resume Link") are filtered out using a heuristic: exclude keys present in the standard column mapping aliases.

**Rendering:**
- 3-column grid of Q cards (responsive: 2-col on narrow, 1-col on mobile)
- Each card:
  ```
  Q1 (label, small grey text)
  [Full question text, wrapping]
  Yes  (bold, green) / No (bold, red)
  ```
- Cards numbered Q1, Q2… in the order they appear in the JSONB keys

**Empty state:** "No screening data. Import a LinkedIn direct export to see Q&A."

#### 5.7 Google Form Responses

Section heading "Google Form Responses".

Fetched from `/api/campaigns/[id]/form-responses?candidate_id=<id>` (new optional filter).

Shows all form submissions for this candidate:
- Submission timestamp (small, grey)
- Each question → answer as a key-value list

**Empty state:** "No form responses yet."

---

### F2 — Manual Stage Move

**Where:** Stage dropdown appears in two places:
1. On each table row (replaces or supplements the existing stage badge — shown as a clickable badge that opens a dropdown)
2. In the profile drawer header (prominent dropdown button)

**Dropdown options:**
```
imported
good_fit        ← new stage value
stage1_sent
wa_sent
replied
stage2
interview
rejected        ← new stage value
```

**API:** `PATCH /api/candidates/[id]` with body `{ stage: "stage2" }`.

This endpoint already exists conceptually (candidates route). Add the PATCH handler if not present.

**UX:** After stage change, the row updates optimistically. Toast confirms "Moved to Stage 2". If the candidate's current filter would exclude them (e.g. viewing "Stage 1 sent" filter and moving to Stage 2), they disappear from the list after the toast.

**No side effects.** Moving a candidate manually does NOT trigger emails or WhatsApp messages. Those remain separate explicit actions.

---

### F3 — LinkedIn Screening Q&A Display

Already covered in F1 §5.6. This section covers the data extraction logic.

**Key detection heuristic:**
A key in `linkedin_data` is treated as a screening question if:
- It is NOT in the standard alias list (Name, Email, Phone, LinkedIn URL, Title, Company, School, Location, Applied Date, Status, Screening Score, Resume URL, S no, Resume Link)
- Its value is non-empty

This means when an HR imports the LinkedIn direct export CSV (which has columns like "Have you worked on UI/UX design..." → "Yes"), those columns automatically appear in the Q&A grid. No schema change needed.

---

### F4 — LinkedIn Rating Badge (fix `Status` mapping)

**Problem:** The `Status` column in the ApplicantSync CSV ("new", "reviewed", "disqualified") is currently untyped — it goes into `linkedin_data` JSONB. We cannot filter or display it reliably.

**Fix:**

1. **Schema:** Add `linkedin_fit varchar(50)` column to `candidates` table. New migration.

2. **Import mapping:** Add `"status"` → `linkedin_fit` to `HEADER_ALIASES` in `fetchRows.ts`. Value normalisation:
   - `"disqualified"` → `"disqualified"`
   - `"good fit"` / `"goodfit"` → `"good_fit"`
   - `"reviewed"` → `"reviewed"`
   - `"new"` → `null` (don't store — "new" just means unreviewed)
   - anything else → store as-is (lowercase)

3. **Display:** Profile header badge + LinkedIn Rating card read from `linkedin_fit`.

4. **Filter chip:** Add a "Disqualified" and "Good Fit" chip to the stage filter row in the candidates table. These filter on `linkedin_fit` field, not `stage`.

---

### F5 — Google Form Responses in Profile

Covered in F1 §5.7.

**API change needed:** `GET /api/campaigns/[id]/form-responses` currently returns all responses for the campaign. Add optional `?candidate_id=<uuid>` query param to filter to one candidate.

---

### F6 — Fix CSV Import — `Status` column

See F4 above. One line addition to `HEADER_ALIASES`:

```ts
linkedin_fit: [
  "status",
  "linkedin status",
  "linkedin rating",
  "fit",
  "qualification",
]
```

And one column added to `SheetRow` type:
```ts
linkedin_fit: string | null;
```

And the import route must write `linkedin_fit` into the `candidates` table alongside the other fields.

---

### F7 — LinkedIn Direct Export Import (new flow)

**Root cause confirmed:** ApplicantSync's "Export CSV" button deliberately omits screening Q&A and
the LinkedIn Rating (Good Fit / Disqualified). These are locked inside their UI to keep users on
their platform. The `Status` column in their export ("new", "reviewed") is ApplicantSync's own
internal review tag — NOT LinkedIn's Good Fit rating.

**The fix:** Export directly from LinkedIn, not from ApplicantSync.

**How to get the LinkedIn direct export:**
> LinkedIn.com → Jobs → [Job post] → Manage applicants → Download icon (top-right of list)

This CSV has one column per screening question, e.g.:
```
First Name | Last Name | Email | LinkedIn Profile URL | Have you worked on UI/UX design? | Have you worked with databases? | ... | Application Date | LinkedIn Rating
```
This is the same format as the mentor's `Software Developer — Sheet1.csv`.

**Import flow — NO NEW CODE NEEDED for data capture:**
The existing `fetchSheetRows` `raw` field already captures every column verbatim. When this CSV
is imported via the existing Import Candidates dialog, all question columns (and the LinkedIn Rating
column if present) land in `linkedin_data` JSONB automatically. No schema change, no new endpoint.

**What IS needed:**
1. A tooltip/help text in the Import dialog:
   > "Importing from ApplicantSync? That CSV doesn't include screening Q&A or LinkedIn Rating.
   > To see them in profiles, also download from LinkedIn directly (Jobs → Manage applicants →
   > Download) and import that file."
2. A separate **"Import Screening Answers Only"** button — accepts the LinkedIn CSV, matches
   candidates by email (or name fallback), and ONLY updates `linkedin_data` + `linkedin_fit`
   for existing records. Does NOT create new candidates. This lets HRs layer in Q&A on top of
   an existing ApplicantSync import without duplicates.

**LinkedIn Rating column detection:**
If the LinkedIn CSV contains a column named "LinkedIn Rating", "Fit", "Qualification Status", or
similar, map it → `linkedin_fit` during import. Otherwise derive it from the screening score:
- Score present + all knockout Q's answered "Yes" → `good_fit`
- Any knockout Q answered "No" → `disqualified`
(Knockout detection: configurable per campaign, defaults to "all questions must be Yes")

---

## 6. API Changes

| Method | Endpoint | Change |
|--------|----------|--------|
| PATCH | `/api/candidates/[id]` | New handler — accepts `{ stage?, linkedin_fit?, notes? }` |
| GET | `/api/campaigns/[id]/form-responses` | Add optional `?candidate_id=<uuid>` filter |
| GET | `/api/candidates/[id]` | New handler — returns single candidate with all fields |

---

## 7. Schema Changes

One new migration:

```sql
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin_fit varchar(50);
CREATE INDEX IF NOT EXISTS candidates_linkedin_fit_idx ON candidates(campaign_id, linkedin_fit);
```

No other schema changes. Screening Q&A uses existing `linkedin_data` JSONB.

---

## 8. Component Plan

| Component | File | Notes |
|-----------|------|-------|
| `CandidateProfileDrawer` | `app/campaigns/[id]/candidate-profile-drawer.tsx` | Main drawer shell |
| `ProfileHeader` | (inside drawer file) | Avatar, badges, action row |
| `InfoCards` | (inside drawer file) | Contact / LinkedIn Rating / Applied For |
| `ScreeningQAGrid` | (inside drawer file) | Q1-Qn 3-col grid |
| `FormResponsesSection` | (inside drawer file) | Fetches + renders form responses |
| `StageMoveDropdown` | `components/ui/stage-move-dropdown.tsx` | Reused in table + drawer |

Table row gets a click handler added in `candidates-table.tsx`. No other files changed in the table.

---

## 9. Implementation Order

1. **Migration** — add `linkedin_fit` column
2. **API: PATCH `/api/candidates/[id]`** — stage + linkedin_fit + notes update
3. **API: GET `/api/candidates/[id]`** — single candidate fetch
4. **API: form-responses `?candidate_id` filter**
5. **`StageMoveDropdown` component** + wire into table rows
6. **`CandidateProfileDrawer`** — all sections
7. **Fix fetchRows.ts** — add `linkedin_fit` to SheetRow + HEADER_ALIASES
8. **Fix import route** — write `linkedin_fit` to DB on import
9. **Filter chips** — add Good Fit / Disqualified chip to candidates table filter bar

---

## 10. Open Questions

| # | Question | Default |
|---|----------|---------|
| OQ1 | Drawer width: 60% or full-screen on desktop? | 60% |
| OQ2 | Should "rejected" be a valid manual stage? | Yes, include it |
| OQ3 | "good_fit" stage vs "linkedin_fit" field — are they the same concept or separate? | Separate. `stage` = pipeline position. `linkedin_fit` = LinkedIn's own rating. |
| OQ4 | When importing LinkedIn direct export, should it create new candidates or only update existing? | Create new (existing behaviour). "Screening-only update" flow is v0.4+ |
| OQ5 | Should the drawer be reachable via URL (`?candidate=id`)? | Yes — makes it shareable |
