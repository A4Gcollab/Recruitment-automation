# LinkedIn Recruitment Automation Agent — PRD v2.1 Final

> Single source of truth. Converted from LinkedIn_Automation_PRD_v2.1_Final.docx


TECHNICAL PRODUCT REQUIREMENTS DOCUMENT

LinkedIn Recruitment Automation Agent

Email-First Pipeline  |  Zero Cost  |  Zero Ban Risk  |  v2.1 Final



## 1.  Overview & Architecture Decision


This is the final technical specification for the LinkedIn Recruitment Automation Agent. The system automates the full recruitment pipeline — applicant import, re-rating, Google Form dispatch, response evaluation, and interview invite — using email as the sole communication channel with candidates.


The single most important architectural decision in this version: candidate email addresses are collected directly through LinkedIn's Easy Apply form at the point of application. When a candidate applies for the role on LinkedIn, they fill a mandatory custom screening question asking for their email address. This email is then exported using a **free Chrome extension (ApplicantSync)** that extracts all applicant data — including screening question answers — to a Google Sheet or CSV. No paid scraping tool or third-party email enrichment is needed.




## 2.  LinkedIn Easy Apply — Email Collection Setup


This section covers the one-time setup that Suhani (or whoever posts the job) must do on LinkedIn before any campaign runs. It takes under 5 minutes per job posting and is the foundation the entire email pipeline depends on.


### 2.1  Setting Up the Custom Email Question

- Log in to LinkedIn and go to the job posting creation page (or edit an existing posting).
- In the 'Screening questions' section, click 'Add a question'.
- Select 'Custom question' and enter: 'Please enter your email address so we can send you the next steps in the recruitment process.'
- Set the question type to 'Short answer'.
- Mark the question as 'Required' — candidates cannot submit without answering.
- Ensure the job is set to 'Easy Apply' (not External Apply). External Apply bypasses LinkedIn's question form entirely.
- Publish the job posting. All new applicants will now provide their email at the point of application.


### 2.2  Exporting Applicant Data (Free — ApplicantSync Chrome Extension)

HR installs the free [ApplicantSync](https://www.applicantsync.com) Chrome extension (alternative: [LinkedIn Job Applicants Exporter](https://chromewebstore.google.com/detail/gpncmkeondkmbbchjekdilncigiphljb)). On the LinkedIn job posting's Applicants page, click the extension → export all applicants to Google Sheet or CSV. The export includes all Easy Apply screening question answers (including the mandatory email field) alongside standard profile data (name, LinkedIn URL, headline, location, application date). Zero cost, unlimited exports.




## 3.  System Architecture


The system has four clean layers: (1) LinkedIn data layer — HR exports applicant data (including email from Easy Apply screening question) via the free ApplicantSync Chrome extension to a Google Sheet, then imports into the app; (2) Google Sheets layer — master candidate tracker and form response source; (3) Evaluation engine — applies Suhani's pass/fail criteria; (4) Email dispatch layer — sends all outbound communication via Gmail SMTP.


### 3.1  Components


### 3.2  End-to-End Data Flow

- Suhani posts job on LinkedIn with Easy Apply + mandatory email screening question.
- Candidates apply via Easy Apply, entering their email address in the required field.
- HR creates campaign in dashboard: selects job posting ID, links Role Config (name, form link, Zoom link), sets evaluation criteria.
- HR uses ApplicantSync Chrome extension to export all applicants (with emails from Easy Apply answers) to a Google Sheet.
- HR clicks 'Import Applicants' in dashboard and pastes the Google Sheet URL. All data written to PostgreSQL and initialised as rows in the campaign tracker Google Sheet — with email already populated.
- Candidates missing an email are flagged in a 'Missing Email' list. HR handles these individually.
- Re-rating (changing LinkedIn ratings) is done manually by HR in the LinkedIn UI. System does not write to LinkedIn.
- Good Fit candidates (with emails) queued in email queue (database table). Emails released at max 20/hr with 30–60 second gaps, 9am–6pm IST only.
- Each sent email logged in PostgreSQL and tracker sheet updated in real time.
- Google Sheets Poller checks form response sheet every 5 minutes. New rows trigger Evaluation Engine.
- Engine applies Tier 1 deal-breakers first. Any fail = FAIL. All pass = Tier 2 check. Borderline = REVIEW.
- At T+20hrs, system checks per-candidate submission. No submission → reminder email queued. Already submitted → no action.
- PASS → candidate queued for Stage-2 email. REVIEW → HR notification + Approvals Queue. FAIL → no further action.
- HR confirms shortlist, enters Zoom details. Stage-2 emails dispatched. Tracker updated.
- Gmail API polls inbox every 10 minutes. 'Confirmed' replies logged automatically. Pipeline complete.

## 4.  LinkedIn Data Layer — Free Chrome Extension

Applicant data (including email from the Easy Apply screening question) is exported using a **free Chrome extension** — no paid scraping tool required.

### 4.1  Recommended Extensions (pick one)

| Extension | Cost | Exports screening Q answers? | Output |
|---|---|---|---|
| [ApplicantSync](https://www.applicantsync.com) | Free, unlimited | Yes | CSV / Excel |
| [LinkedIn Job Applicants Exporter](https://chromewebstore.google.com/detail/gpncmkeondkmbbchjekdilncigiphljb) | Free | Yes | CSV / JSON / Google Sheets |

### 4.2  Workflow

1. HR opens the LinkedIn job posting → Applicants tab in Chrome.
2. Clicks the extension icon → Export All.
3. Extension extracts: name, LinkedIn URL, headline, location, application date, and all screening question answers (including the mandatory email field).
4. Export is saved as a Google Sheet (or CSV uploaded to Google Sheets).
5. HR pastes the Google Sheet URL in the dashboard → clicks Import.
6. System reads the sheet, maps columns, writes all candidates to PostgreSQL + campaign tracker sheet.

### 4.3  Safety & Compliance

- Extension runs entirely in HR's browser — no server-side LinkedIn access, no session cookies stored by our system.
- Read-only: the extension only reads LinkedIn pages. It never writes, messages, or modifies anything on LinkedIn.
- No LinkedIn TOS §8.2 risk: no automated scraping, no API abuse, no bot behavior. HR manually navigates to the page and clicks export.
- Re-rating (changing applicant ratings on LinkedIn) is done manually by HR in the LinkedIn UI.

### 4.4  Cost

**$0/month.** Both extensions are free with no usage limits. This replaces the $56–128/month PhantomBuster cost from the original PRD.



## 5.  Email Sending Layer — Gmail SMTP + Nodemailer


All candidate emails — Stage-1 screening form link, reminders, and Stage-2 interview invites — are sent from the organisation's Gmail account using Nodemailer, a free Node.js email library connected to Gmail's SMTP server.


### 5.1  Setup (One-Time)

- Create a dedicated Gmail account for recruitment, e.g. hr.omysha@gmail.com or recruitment@omysha.org
- Enable 2-Step Verification on the Gmail account.
- Generate a Gmail App Password (16-character code — Google Account → Security → App Passwords).
- Store the App Password as a server-side environment variable. It is never written in code or exposed to the frontend.
- Configure Nodemailer in the backend with this App Password. Test with one email before any campaign runs.

### 5.2  Daily Limits & Deliverability


### 5.3  Inbox Delivery — Avoiding Spam

- Sender name set to 'Omysha Foundation — HR Team', not a raw Gmail address
- Subject lines are personalised per candidate (name + role) — not identical bulk-blast subjects
- Sending rate: max 20 emails/hour with 30–60 second random gaps between each send
- Warm-up: first 7 days cap at 50 emails/day to build sender reputation before scaling to full volume
- Email footer: 'If you did not apply for this role, please disregard this email.' — reduces spam reports
- Bounce handling: Nodemailer captures SMTP bounce errors; bounced emails logged in tracker immediately; candidate flagged for HR

## 6.  Module-by-Module Specification


### 6.1  Module 1 — Applicant Import & Re-Rating

#### 6.1.1  Import

- HR exports applicants from LinkedIn using the free ApplicantSync Chrome extension → saves to Google Sheet.
- HR opens the dashboard, clicks 'Import Applicants', pastes the Google Sheet URL.
- System reads the sheet via Google Sheets API, maps columns (auto-detect heuristic + manual override), and writes all candidates to PostgreSQL.
- Each candidate is also initialised as a row in the campaign tracker Google Sheet (auto-created per campaign).
- Candidates missing an email (applied before the screening question was added) are flagged in a 'Missing Email' list — HR enters email manually.

#### 6.1.2  Re-Rating

- Re-rating (changing applicant ratings on LinkedIn) is done **manually by HR** in the LinkedIn UI.
- The system does NOT write to LinkedIn. This avoids any TOS risk and removes the paid PhantomBuster dependency.
- HR can record rating changes in the dashboard for audit purposes. Every change is logged with timestamp and actor.

### 6.2  Module 2 — Email Template Engine

#### 6.2.1  Template Variables


#### 6.2.2  Stage-1 Email — Google Form Screening Link


#### 6.2.3  Stage-2 Email — Interview Invite


#### 6.2.4  Reminder Email — Triggered at T+20 Hours


### 6.3  Module 3 — Google Form Evaluation Engine

#### 6.3.1  Two-Tier Evaluation — Confirmed by Suhani



#### 6.3.2  Verdict Outputs


#### 6.3.3  Form Question Mapping

- HR maps each form question to either a Tier 1 deal-breaker or a Tier 2 flexible criterion in the dashboard during campaign setup
- For Tier 1 questions, HR sets the acceptable answer(s): e.g. 'Available', 'Yes', specific time options
- For Tier 2 questions, HR sets a minimum quality threshold: e.g. 'Flag if blank or under 15 words'
- This mapping is saved as part of the Role Config and reused for all future campaigns of that role

#### 6.3.4  Respondent Matching

Since the candidate's email is now known from the Easy Apply question, matching form responses to LinkedIn candidates is straightforward:

- Primary: Email from Google Form response matched to email in the candidate's record (imported from Easy Apply answer). This is an exact match.
- Fallback: Full name fuzzy match (90%+ similarity threshold) for edge cases where the candidate used a different email in the form.
- Manual: Unmatched responses flagged in dashboard for HR to link. Does not block processing of other candidates.

### 6.4  Module 4 — Candidate Tracker Google Sheet

One Google Sheet is auto-created per campaign. The system maintains it entirely — HR never needs to manually write to it. Column R is reserved exclusively for HR notes.




### 6.5  Module 5 — Admin Dashboard


#### Three Mandatory HR Approval Gates

The system will not take any irreversible action without explicit HR sign-off at these three points:


## 7.  Role-Based Configuration


Templates, form links, and Zoom links differ per role (confirmed by Suhani). These are stored as Role Configs — set once per role, reused for every campaign of that role. HR updates the Role Config in the dashboard whenever a detail changes, such as a new Zoom link.




## 8.  Automated Reminder Logic



- Exactly one reminder per candidate — the system cannot send a second under any circumstance
- The deadline clock is per-candidate, starting from the moment their specific email was delivered
- Reminder emails follow the same rate-limiting rules as Stage-1 emails (max 20/hr, 30–60s gaps)

## 9.  Attendance Confirmation Detection


After Stage-2 interview invite emails are sent, candidates are asked to reply with 'Confirmed — [Name]'. The system detects these replies automatically using the Gmail API.


- Gmail API polls the recruitment inbox every 10 minutes for new email replies
- Detection logic: email must be a reply to a Stage-2 thread AND body must contain the keyword 'Confirmed'
- On detection: Column Q in tracker sheet updated to 'Yes'; pipeline funnel count updated in dashboard
- Replies that do not contain 'Confirmed' are flagged in the dashboard as 'Unstructured Reply' for HR to read — may be questions or rescheduling requests
- Authentication: Gmail API using OAuth 2.0 on the same recruitment Gmail account used for sending

## 10.  Google APIs Integration



### 10.1  Google Sheets Polling

- Poll interval: every 5 minutes, configurable down to 3 minutes minimum
- Deduplication: system tracks the last processed row index. Only new rows are evaluated — never double-processed.
- Batch writes: up to 10 tracker updates batched into one API call to stay comfortably within Google Sheets quota (300 requests/min)
- Failure handling: 3 retries with exponential backoff (15s, 30s, 60s) before HR is notified of polling failure

## 11.  Error Handling & Reliability



## 12.  Security & Data Handling



## 13.  Internal REST API Reference


Backend endpoints consumed by the admin dashboard frontend. Engineering reference.



## 14.  Build Plan & Milestones




## 15.  Full Cost Breakdown




## 16.  Out of Scope — Version 2.1




Confidential  —  A4G Impact Collaborative / Omysha Foundation  |  LinkedIn Automation Agent Technical PRD v2.1 (Email-First, Easy Apply)  |  April 2026


**Table 1:**

| Product | LinkedIn Recruitment Automation Agent |
| --- | --- |
| Version | 2.1 — Final Spec (Email-First + Easy Apply Email Collection) |
| Organisation | Omysha Foundation · VONG Movement · A4G Impact Collaborative |
| HR Owner | Suhani Jain, HR Lead |
| Prepared by | Engineering & Product Team |
| Key Decision | Candidate emails collected via LinkedIn Easy Apply mandatory field — no third-party enrichment needed |
| Status | Ready for Development |
| Date | April 2026 |


**Table 2:**

| Why This Works | LinkedIn Easy Apply supports custom screening questions on job postings.
One of those questions is set as: 'Please enter your email address' — mandatory, validated.
Every candidate who applies provides their email at the moment of application.
ApplicantSync reads this along with all other profile data in the import step.
Result: 100% email coverage from day one, for free, with no extra tool or process. |
| --- | --- |


**Table 3:**

| Aspect | Previous Thinking (Dropped) | Final Decision (This Document) |
| --- | --- | --- |
| Email collection | Three-layer strategy: profile scrape + Hunter.io + form field | Single source: LinkedIn Easy Apply mandatory email question |
| Hunter.io | Required for ~30% of candidates | Not needed — removed entirely |
| Manual fallback | HR sends LinkedIn DMs for missing emails (~10–20%) | Not needed — all applicants provide email on application |
| Email coverage | ~80–90% automatic, rest manual | 100% from the point of application |
| Extra tools | Hunter.io subscription (~$49/mo) | None — zero additional cost |
| Complexity | Three layers of enrichment logic to build and maintain | One simple field read in the import step |


**Table 4:**

| Important | This must be done for EVERY new job posting. It is a per-posting setting, not a global one.
For existing postings (already live), LinkedIn does not allow adding questions retroactively.
For an already-live posting with existing applicants: re-post the job with the email question,
or add a mandatory email field to the Stage-1 Google Form as a one-time fallback for that campaign only. |
| --- | --- |


**Table 5:**

| Data Field | Source | Available in ApplicantSync Export? |
| --- | --- | --- |
| Candidate full name | LinkedIn profile | Yes |
| LinkedIn profile URL | LinkedIn profile | Yes |
| Current LinkedIn rating | Recruiter applicant status | Yes |
| Headline | LinkedIn profile | Yes |
| Location | LinkedIn profile | Yes |
| Application date | LinkedIn applicant data | Yes |
| Email address | Easy Apply screening question | Yes — appears as custom question answer in export |


**Table 6:**

| Zero Extra Steps | The email is not fetched separately — it comes in the same ApplicantSync run as all other applicant data.
No second API call, no enrichment step, no matching logic needed.
The system reads the email column from the ApplicantSync export and stores it directly. |
| --- | --- |


**Table 7:**

| Component | Technology | Responsibility |
| --- | --- | --- |
| Admin Dashboard | Next.js 15 App Router + shadcn/ui + TanStack Query | HR configures campaigns, templates, criteria, monitors pipeline, handles approvals |
| Backend API | Next.js 15 API Routes (Route Handlers) | Orchestrates all automation logic; REST endpoints for dashboard |
| LinkedIn Data Layer | ApplicantSync Chrome extension (free) → Google Sheet → app import | HR exports applicants from LinkedIn; system imports from Google Sheet |
| Email Queue | PostgreSQL `email_queue` table + UptimeRobot cron (every 5 min) | Holds outgoing emails; enforces rate limiting (20/hr), scheduling, retry logic |
| Email Sender | Nodemailer + Gmail SMTP (App Password) | Sends all Stage-1, reminder, and Stage-2 emails from org Gmail account |
| Form Response Poller | Google Sheets API v4 + cron (every 5 min) | Polls form response sheet for new submissions |
| Evaluation Engine | Custom rule engine (TypeScript, Next.js API route) | Applies Tier 1 deal-breakers + Tier 2 flexible criteria to each submission |
| Candidate Tracker | Google Sheets API v4 (auto-created per campaign) | Live record of every candidate's status across all 18 columns |
| Reply Detector | Gmail API + cron (every 10 min) | Reads inbox for 'Confirmed' replies to Stage-2 emails |
| Database | PostgreSQL (local: WSL native; prod: Neon free tier) | Campaign config, candidate records, email logs, verdicts, full audit trail |
| Auth | NextAuth v5 (credentials provider, JWT sessions) | Single admin login, 8-hour session expiry |
| Hosting | Vercel Hobby (free) | Next.js deployment, preview deploys, SSL |
| Cron Trigger | UptimeRobot (free, 5-min checks) | Pings `/api/cron/*` endpoints to process email queue + poll forms + poll inbox |
| Notifications | Gmail (same SMTP) | HR alerts for manual reviews, errors, failed deliveries |


**Table 8:**

| Task | ApplicantSync Phantom | What It Does |
| --- | --- | --- |
| Import applicants + emails | LinkedIn Recruiter Profile Scraper | Exports all applicants for a job posting: profile data + Easy Apply question answers including email |
| Update applicant ratings | LinkedIn Recruiter — Rating Update | Sets applicant rating to Good Fit after HR confirms the re-rating list |


**Table 9:**

| Plan | Cost | Execution Time/Month | Right For |
| --- | --- | --- | --- |
| Starter | $56/month | 20 hours | Up to ~3 job campaigns/month at current A4G volume |
| Pro | $128/month | 80 hours | Up to ~10 campaigns/month or high-applicant postings |


**Table 10:**

| Recommendation | Starter plan at $56/month is sufficient for A4G's current hiring volume. This is the only paid component in the entire system. |
| --- | --- |


**Table 11:**

| Gmail Tier | Daily Limit | Cost | Notes |
| --- | --- | --- | --- |
| Free Gmail SMTP | 500 emails/day | Free | Sufficient for A4G — 200 applicants per campaign is comfortably within limit |
| Google Workspace SMTP | 2,000 emails/day | ~$6/month | Upgrade path if volume grows significantly in future |


**Table 12:**

| Re-Rating Priority Order (Fixed Across All Campaigns and All Roles) | Priority 1: Process all 'Maybe' candidates — evaluate and move suitable ones to 'Good Fit'
Priority 2: Then process all 'Not a Fit' candidates — same evaluation
Priority 3: Then process 'Unrated' candidates last

This order is non-negotiable and applies consistently to every role and every campaign.
HR reviews the full proposed re-rated list in the dashboard before any change is applied to LinkedIn. |
| --- | --- |


**Table 13:**

| Variable | Source | Example / Notes |
| --- | --- | --- |
| {CandidateFirstName} | LinkedIn profile — first name only | Priya |
| {RoleName} | Role Config — set by HR once per role | HR Intern |
| {OrgName} | Global config — rarely changes | Omysha Foundation |
| {FormLink} | Role Config — HR pastes Google Form URL | Changes per role, reused across campaigns for that role |
| {Deadline} | Auto-calculated: 24 hrs from email send timestamp | e.g. 'April 16, 11:30 AM IST' |
| {InterviewDate} | Set by HR when launching Stage-2 | e.g. Friday, 3rd April 2026 |
| {InterviewTime} | Set by HR when launching Stage-2 | e.g. 3:00 PM IST |
| {InterviewMode} | Set by HR when launching Stage-2 | e.g. Zoom |
| {MeetingLink} | Role Config — shared Zoom link per role | Updated by HR in Role Config when link changes |
| {MeetingID} | Role Config | Per role — set once, reused |
| {Passcode} | Role Config | Per role — set once, reused |


**Table 14:**

| Stage-1 Email Template | Subject: Next Step — Stage-1 Screening Form | {RoleName} | {OrgName}

Dear {CandidateFirstName},

Thank you for your interest in the {RoleName} role at {OrgName}.

As the next step in our selection process, shortlisted candidates are requested to
complete the Stage-1 Screening Form within 24 hours of receiving this email:

     Google Form Link: {FormLink}

Your responses will help us understand your alignment with the role. Based on the
evaluation, selected candidates will be invited for an online interaction.

Please note: only candidates who submit the form within the given timeline will be
considered for the interview stage.

Deadline: {Deadline}

Warm regards,
HR Team | {OrgName}

(If you did not apply for this role, please disregard this email.) |
| --- | --- |


**Table 15:**

| Stage-2 Email Template | Subject: Congratulations — You Are Shortlisted for Interview | {RoleName} | {OrgName}

Dear {CandidateFirstName},

Congratulations, and thank you for taking the time to complete the Stage-1 Screening
Form for the {RoleName} role at {OrgName}.

We are pleased to inform you that you have successfully cleared the screening round
and have been shortlisted for the Interaction & Interview Stage.

Interview Structure (all conducted on the same day):
     - Natural Trait Fitment
     - Organisational Fitment
     - HR Interaction

Date: {InterviewDate}     Time: {InterviewTime} IST     Mode: {InterviewMode}

     Join: {MeetingLink}
     Meeting ID: {MeetingID}     Passcode: {Passcode}

Please join from a desktop or laptop with a stable internet connection (minimum
10 Mbps), tested microphone, and working camera.

This will be a group discussion followed by a personal interview (~2 hours).
Please join on time.

Confirm your attendance by replying to this email:
     'Confirmed — [Your Name]'

Warm regards,
HR Team | {OrgName} |
| --- | --- |


**Table 16:**

| Reminder Email Template | Subject: Reminder — 4 Hours Left | {RoleName} Screening Form | {OrgName}

Hi {CandidateFirstName},

This is a gentle reminder that you have approximately 4 hours remaining to complete
the Stage-1 Screening Form for the {RoleName} role at {OrgName}.

     Form Link: {FormLink}
     Deadline: {Deadline}

Please submit at the earliest to be considered for the next stage.

Warm regards,
HR Team | {OrgName} |
| --- | --- |


**Table 17:**

| TIER 1 — Deal-Breakers (Any single fail = Automatic FAIL, no further evaluation) | 1.  College availability     — schedule must be compatible with role requirements
2.  Timing availability      — must be able to attend required hours and slots
3.  Bandwidth                — must demonstrate capacity to handle the workload
4.  Stability                — must show consistency and commitment level
5.  Other commitments        — must not have conflicts with internship or job hours
6.  Process availability     — must attend meetings and stay consistently connected

If ANY one of these six conditions is not met → AUTOMATIC FAIL. Evaluation stops. |
| --- | --- |


**Table 18:**

| TIER 2 — Flexible Criteria (Quality assessment — not a hard rejection by default) | 1.  Understanding of the role  — theoretical knowledge questions
2.  AI / domain short answers  — role-specific knowledge
3.  Long-form / paragraph      — quality of written responses

Triggers FAIL only if responses are blank, clearly irrelevant, or copy-pasted.
Otherwise contributes to a qualitative fit score — not a pass/fail gate. |
| --- | --- |


**Table 19:**

| Verdict | Condition | Automatic Next Action |
| --- | --- | --- |
| PASS | All 6 deal-breakers met AND Tier 2 responses acceptable | Queued for Stage-2 interview invite email |
| FAIL | One or more deal-breakers not met | Marked FAIL in tracker. Fail reason recorded (which deal-breaker). No further emails. |
| REVIEW | All deal-breakers met BUT one or more Tier 2 responses borderline/missing | Added to HR Approvals Queue. HR notification sent. HR decides PASS or FAIL. |


**Table 20:**

| Column | Data Stored | Updated By |
| --- | --- | --- |
| A | Candidate Full Name | System — on import |
| B | LinkedIn Profile URL | System — on import |
| C | Original LinkedIn Rating | System — on import |
| D | Rating After Re-rating | System — after HR confirms re-rating |
| E | Email Address | System — from Easy Apply answer on import |
| F | Stage-1 Email Sent (Yes / No) | System — after send |
| G | Stage-1 Email Sent At | System — timestamp |
| H | Stage-1 Email Bounced (Yes / No) | System — Nodemailer bounce callback |
| I | Form Submitted (Yes / No / Pending) | System — form poller match |
| J | Form Submitted At | System — timestamp |
| K | Evaluation Verdict (PASS / FAIL / REVIEW) | Evaluation Engine |
| L | Fail Reason (if FAIL) | Evaluation Engine — which deal-breaker failed |
| M | Reminder Email Sent (Yes / No) | System — at T+20hr check |
| N | Reminder Email Bounced (Yes / No) | System — Nodemailer bounce callback |
| O | Stage-2 Email Sent (Yes / No) | System — after send |
| P | Stage-2 Email Sent At | System — timestamp |
| Q | Attendance Confirmed (Yes / No / Pending) | System — Gmail API reply detection |
| R | HR Notes | HR manual only — system never writes here |


**Table 21:**

| Sheet Naming Convention | '[RoleName] Campaign Tracker — [StartDate]'
Example: 'HR Intern Campaign Tracker — April 2026'
A new sheet is created per campaign. All campaign sheets live in one shared Google Sheets workbook that HR can access anytime. |
| --- | --- |


**Table 22:**

| Page / Section | What HR Can Do |
| --- | --- |
| Campaigns | Create campaign, select job posting ID, link Role Config, set evaluation criteria, start / pause / close |
| Role Config | Set role name, Google Form link, Zoom link, Meeting ID, Passcode, email templates — saved and reused per role |
| Evaluation Setup | Map form questions to Tier 1 deal-breakers or Tier 2 flexible criteria; set acceptable answers and quality thresholds |
| Pipeline Funnel | Live funnel view: Imported → Good Fit → Stage-1 Sent → Form Submitted → Passed → Stage-2 Sent → Confirmed |
| Candidate List | Full table with all 18 columns from tracker sheet. Click any candidate for complete activity timeline. |
| Approvals Queue | REVIEW-verdict candidates shown with their full form responses. HR clicks PASS or FAIL for each. |
| Re-rating Review | Proposed re-rated candidate list before any LinkedIn changes are made. HR reviews and clicks Confirm. |
| Missing Email List | Candidates imported without an email (applied before question was added). HR can enter email manually. |
| Stage-2 Launch | Shortlist summary, interview date/time/mode input, Zoom details input, preview of Stage-2 email, send confirmation |
| Message Logs | Every email sent: candidate name, subject, timestamp, delivery status (sent / bounced / pending) |
| Settings | Gmail SMTP config, sending window (default 9am–6pm IST), daily cap (default 200, max 500), ApplicantSync API key |


**Table 23:**

| Gate | What HR Does | What Happens If HR Skips |
| --- | --- | --- |
| Gate 1 — Re-rating | Reviews proposed Good Fit list → clicks 'Confirm & Apply' | No LinkedIn ratings are changed. System waits indefinitely. |
| Gate 2 — Stage-1 Send | Previews Stage-1 email + Good Fit list → clicks 'Send Screening Emails' | No Stage-1 emails sent. Queue does not start. |
| Gate 3 — Stage-2 Send | Reviews shortlist + enters Zoom details → clicks 'Send Interview Invites' | No Stage-2 emails sent. System waits indefinitely. |


**Table 24:**

| Config Field | HR Intern | Social Psychology Intern | Any Future Role |
| --- | --- | --- | --- |
| Role Name | HR Intern | Social Psychology Research Intern | HR sets on Role Config creation |
| Google Form Link | Role-specific URL | Role-specific URL | HR pastes link |
| Zoom Link | Role-specific URL | Role-specific URL | HR pastes link |
| Meeting ID | Role-specific | Role-specific | HR enters |
| Passcode | Role-specific | Role-specific | HR enters |
| Eval Criteria | Mapped per question | May vary by role | HR maps per campaign |


**Table 25:**

| Zoom Link Updates | When a role's Zoom link changes, HR edits the Role Config in the dashboard. All future Stage-2 emails for that role automatically use the updated link. No code change or engineering support required. |
| --- | --- |


**Table 26:**

| Time After Stage-1 Email | Event | System Action |
| --- | --- | --- |
| T + 0 hrs | Stage-1 email delivered | Per-candidate deadline clock starts (individual, not batch-wide) |
| T + 20 hrs | System checks submission status | Not submitted → reminder email queued. Already submitted → no action. |
| T + 20 hrs | Reminder sent (if applicable) | Logged in tracker (Column M = Yes). Counts toward daily send limit. |
| T + 20 hrs | Stage-1 email was bounced | Reminder skipped — no point sending to bad address. Candidate stays flagged. |
| T + 24 hrs | Deadline passes | Not submitted → marked 'Did Not Submit'. No further emails ever. |
| T + 24 hrs | Reminder sent but form still not submitted | Marked 'Did Not Submit Despite Reminder' — separate flag visible in dashboard |


**Table 27:**

| API | Auth Method | Purpose | Cost |
| --- | --- | --- | --- |
| Google Sheets API v4 | Service Account (read + write) | Form response polling every 5 min; candidate tracker sheet create and update | Free |
| Gmail API | OAuth 2.0 (recruitment Gmail) | Poll inbox for 'Confirmed' attendance replies to Stage-2 emails | Free |
| Gmail SMTP | App Password (env variable) | Send all outbound emails: Stage-1, reminders, Stage-2 | Free |


**Table 28:**

| Failure Scenario | System Response | HR Notification |
| --- | --- | --- |
| Email bounces (Stage-1, reminder, or Stage-2) | Logged immediately in tracker (bounce column). Candidate flagged. No further emails to that address. | Dashboard shows bounce list. HR can enter corrected email manually — system retries automatically. |
| Gmail SMTP daily limit reached (500/day) | Queue pauses. Remaining emails queued for next business day at 9am IST. | Email alert: 'Daily limit reached. X emails will send tomorrow morning.' |
| Google Sheets poll fails | Retry every 2 minutes for 10 minutes. Then pause. | Email alert: 'Form polling paused. Check Google Sheets API access.' |
| Form respondent email does not match any candidate | Flagged in Approvals Queue with full response data. | HR prompted to manually link respondent to a candidate profile. |
| Gmail API inbox poll fails | Retry every 15 minutes. Log error after 3 consecutive failures. | Alert sent to HR + engineering after 3 failures. |
| ApplicantSync import fails or times out | Error logged. Campaign import marked Incomplete. | HR prompted to retry import from the dashboard. |
| Candidate has no email after import | Added to Missing Email list — not an error, expected for edge cases. | Visible in dashboard Missing Email section. HR enters email manually. |


**Table 29:**

| Area | Implementation |
| --- | --- |
| Gmail App Password | Server-side environment variable only. Never in frontend code, never in source control. |
| ApplicantSync session cookie | Managed inside ApplicantSync's own platform. Our backend triggers runs via ApplicantSync API key only. |
| ApplicantSync API key | Server-side environment variable. |
| Google Service Account key | Environment variable. Access scoped strictly to sheets and Gmail we create and own. |
| Candidate email addresses | Stored in PostgreSQL (encrypted at rest). Used only for this recruitment process. Not shared with any third party. |
| Data retention | All candidate data purged from PostgreSQL and tracker sheet 90 days after campaign close. |
| Dashboard access | Email + bcrypt-hashed password login. Sessions expire after 8 hours of inactivity. |
| All API communication | HTTPS/TLS 1.3 only. No plain HTTP anywhere in the system. |
| Audit log | Every system action — email sent, rating changed, verdict applied, HR override — is immutably logged with timestamp and actor. |
| DPDP / GDPR alignment | Emails used solely for stated recruitment purpose. Candidate data deletion request triggers full purge from dashboard. |


**Table 30:**

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | /api/campaigns | Create new campaign |
| GET | /api/campaigns/:id | Get campaign details, config, and current pipeline stats |
| POST | /api/campaigns/:id/import | Import applicants from Google Sheet (exported via ApplicantSync Chrome extension) |
| POST | /api/campaigns/:id/rerate | HR records re-rating changes for audit (LinkedIn ratings updated manually by HR in LinkedIn UI) |
| POST | /api/campaigns/:id/send-stage1 | HR Gate 2: triggers Stage-1 email queue for all Good Fit candidates |
| GET | /api/campaigns/:id/candidates | All candidates with full pipeline status and all columns |
| GET | /api/campaigns/:id/missing-emails | Candidates imported without an email address |
| POST | /api/candidates/:id/email | HR manually enters or corrects a candidate's email address |
| GET | /api/campaigns/:id/review-queue | Candidates with REVIEW verdict pending HR decision |
| POST | /api/candidates/:id/verdict | HR submits manual PASS or FAIL for a REVIEW candidate |
| POST | /api/campaigns/:id/send-stage2 | HR Gate 3: confirms shortlist and triggers Stage-2 email queue |
| GET | /api/campaigns/:id/message-log | Full email history: candidate, subject, timestamp, delivery status |
| GET | /api/campaigns/:id/tracker-sheet-url | Returns Google Sheets URL for this campaign's tracker |
| GET | /api/roles | List all saved Role Configs |
| POST | /api/roles | Create a new Role Config |
| PUT | /api/roles/:id | Update existing Role Config (e.g. new Zoom link or form URL) |


**Table 31:**

| Phase | What Gets Built | Duration | Deliverable / Test Criteria |
| --- | --- | --- | --- |
| 0 — Foundation | ApplicantSync account + test run, Gmail SMTP setup + test email sent, Google Service Account, PostgreSQL schema, project repo, all env config | 3 days | Test email lands in inbox. ApplicantSync exports one applicant successfully with email column visible. |
| 1 — Import | ApplicantSync applicant import via API, email column extraction from Easy Apply answer, all candidate data written to PostgreSQL and tracker sheet, Missing Email list for edge cases | 4 days | 200 test candidates imported. Email populated for all who used Easy Apply. Tracker sheet created and populated correctly. |
| 2 — Re-Rating | Re-rating logic (Maybe → Not a Fit → Unrated order), proposed list view in dashboard, HR confirmation Gate 1, ApplicantSync rating update on confirm | 4 days | HR confirms re-rating. LinkedIn ratings updated. All changes logged with timestamp. |
| 3 — Stage-1 Email | Template engine with all dynamic variables, email queue (database table) queue with 20/hr rate limit + 30–60s random gaps + 9am–6pm IST window, bounce detection, tracker write | 5 days | Stage-1 emails send at correct rate. Personalisation correct per candidate. Bounces flagged in tracker. |
| 4 — Form Polling | Google Sheets poller every 5 min, respondent matching by email, Tier 1 deal-breaker engine, Tier 2 flexible quality check, PASS/FAIL/REVIEW verdicts, verdict written to tracker | 5 days | Form submission detected within 5 minutes. Verdict applied correctly per configured criteria. |
| 5 — Reminders | T+20hr per-candidate reminder timer, reminder email queue, skip-if-bounced logic, 'Did Not Submit' and 'Did Not Submit Despite Reminder' flags in tracker | 2 days | Reminder sent at exactly 20hr mark. Bounced addresses skipped. Second reminder never sent. |
| 6 — Stage-2 Email | Shortlist confirmation Gate 3, Zoom details input, Stage-2 email queue, Gmail API inbox polling every 10 min for 'Confirmed' replies, attendance logged in tracker | 4 days | Interview invites sent to PASS candidates. 'Confirmed' replies auto-logged in Column Q. |
| 7 — Dashboard | Full React admin dashboard: all pages from Section 6.5, pipeline funnel, approvals queue, missing email list, message logs, role config editor, re-rating review | 7 days | HR runs a complete campaign from import to interview invite entirely from the dashboard without engineering help. |
| 8 — QA & UAT | End-to-end test on a real job posting with Suhani. Validate all emails land in inbox (not spam). Check tracker sheet accuracy. Fix all issues. | 5 days | Suhani signs off on full pipeline working correctly. |
| 9 — Launch | Production deployment, uptime monitoring, HR handover documentation, 30-minute live walkthrough with Suhani | 2 days | System live. First real campaign running. |


**Table 32:**

| Total Estimate | ~41 working days from project kickoff to production launch (approximately 8 weeks).
This is the cleanest and simplest version of the system — no enrichment layers, no third-party email APIs, minimal moving parts.
With two developers working in parallel on backend and frontend: approximately 5–6 weeks. |
| --- | --- |


**Table 33:**

| Tool / Service | Purpose | Cost |
| --- | --- | --- |
| ApplicantSync Chrome extension | LinkedIn applicant export (name, email, LinkedIn URL, screening answers) | **Free** |
| Gmail SMTP + Nodemailer | Send all Stage-1, reminder, and Stage-2 emails | **Free** (500/day limit) |
| Gmail API | Detect 'Confirmed' reply emails from candidates | **Free** |
| Google Sheets API v4 | Form response polling + candidate tracker sheet creation + live updates | **Free** |
| PostgreSQL | Database for all campaign and candidate data | **Free** — local dev: WSL native; prod: Neon free tier (0.5 GB, 190 compute-hrs/mo) |
| Next.js 15 hosting | Full-stack frontend + API routes | **Free** — Vercel Hobby |
| UptimeRobot | Pings cron endpoints every 5 min (email queue, form polling, inbox polling) | **Free** (50 monitors) |
| ~~PhantomBuster~~ | ~~LinkedIn scraping~~ | ~~$56–128/mo~~ **Replaced by ApplicantSync (free)** |
| ~~Redis~~ | ~~Message queue for BullMQ~~ | **Not needed — email queue is a PostgreSQL table** |
| ~~Hunter.io~~ | ~~Email enrichment~~ | **Not needed — emails come from Easy Apply** |
| ~~Unipile~~ | ~~LinkedIn DMs~~ | **Not needed — email-only pipeline** |


**Table 34:**

| Total Monthly Cost | **$0/month.** Every component runs on free tiers: Vercel Hobby (hosting), Neon free tier (database), Gmail SMTP (500 emails/day), Google Sheets API (300 req/min), ApplicantSync Chrome extension (unlimited exports), UptimeRobot (50 monitors). Zero paid tools. Zero infrastructure cost at A4G's volume (2–4 campaigns/year, under 200 candidates each). |
| --- | --- |


**Table 35:**

| Feature | Reason Deferred |
| --- | --- |
| AI-based resume screening / auto Good Fit classification | Re-rating rule already defined by Suhani — sufficient for v2.1 |
| Calendar integration / auto-slot booking | Shared Zoom links per role confirmed sufficient by Suhani |
| WhatsApp or additional messaging channels | Email is the confirmed channel |
| Email open-rate tracking | Requires custom email proxy setup — adds complexity. Tracker sheet provides sufficient visibility. |
| Multi-recruiter support | Single ApplicantSync + Gmail account sufficient for current A4G volume |
| Automated offer letter dispatch | Post-interview process — outside current scope |
| Analytics / reporting dashboard | Tracker sheet is sufficient for now. Dashboard analytics in v2.2. |

