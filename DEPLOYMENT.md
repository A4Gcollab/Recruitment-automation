# DEPLOYMENT

Step-by-step setup for A4G LinkedIn Recruitment Automation. Follow top-to-bottom the first time.

- **Prereqs:** GitHub access to `A4Gcollab/Recruitment-automation`, a Google Cloud account, a Gmail account for sending, Node 22+, `npm` 10+.
- **Stack:** Next.js 15 · PostgreSQL (local: WSL; prod: Neon) · Vercel Hobby · Gmail SMTP · Google Sheets API · Gmail API. See `PRD_v2.1.md` for rationale.
- **Secrets:** every variable in `CONTRACTS.md §1` lives in `.env.local` locally and Vercel env vars in production. Nothing is `NEXT_PUBLIC_`.

---

## 1. Local bootstrap

```bash
git clone https://github.com/A4Gcollab/Recruitment-automation.git
cd Recruitment-automation
npm install
cp .env.example .env.local
```

Pre-commit hook at `.githooks/pre-commit` enforces git identity:
```bash
git config --local user.name  "SnehaChouksey"
git config --local user.email "snehachoukseyobc@gmail.com"
```

---

## 2. PostgreSQL

### 2a. Local dev — WSL native

```bash
sudo apt install -y postgresql postgresql-client
sudo service postgresql start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb a4g_local
```

`.env.local` already defaults to: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/a4g_local`

### 2b. Production — Neon (free tier)

1. Sign in at <https://console.neon.tech>.
2. Create project `a4g-recruitment`, Postgres 16.
3. Copy the **pooled connection** URL → paste into Vercel env vars as `DATABASE_URL`.

---

## 3. Gmail SMTP (email sending)

All candidate emails (Stage-1 form link, reminders, Stage-2 interview invite) are sent via Gmail SMTP using Nodemailer.

1. Use or create a dedicated Gmail account (e.g. `hr.omysha@gmail.com`).
2. Enable **2-Step Verification**: Google Account → Security → 2-Step Verification → Turn on.
3. Generate an **App Password**: Google Account → Security → App Passwords → select "Mail" → Generate. Copy the 16-character code.
4. Fill in `.env.local`:
   ```
   GMAIL_USER=hr.omysha@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   GMAIL_SENDER_NAME=Omysha Foundation — HR Team
   ```
5. Test: once the app is running, send a single Stage-1 email from the dashboard. Confirm it lands in the candidate's inbox (not spam).

**Daily limit:** 500 emails/day (free Gmail) or 2,000/day (Google Workspace ~$6/mo). Sufficient for A4G's volume.

---

## 4. Google Service Account (Sheets API)

The app reads applicant data from Google Sheets (import), polls form response sheets, and creates/updates campaign tracker sheets.

### 4.1 Create a Google Cloud project

1. <https://console.cloud.google.com> → New project → name `a4g-recruitment`.

### 4.2 Enable APIs

1. APIs & Services → Library → search **Google Sheets API** → Enable.
2. (v0.3+) Search **Gmail API** → Enable.

### 4.3 Create service account

1. IAM & Admin → Service Accounts → Create → name `a4g-sheets`.
2. Skip project roles. Skip user access. Done.
3. Click the account → Keys → Add Key → JSON → Create. Download the JSON file.

### 4.4 Extract env vars

From the JSON:
- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (wrap in double quotes in `.env.local`)

### 4.5 Share sheets

For every Google Sheet the app needs to read (applicant export, form responses):
1. Open the sheet → Share → paste the service account email → Viewer.
2. For tracker sheets the app creates: share with Editor access.

---

## 5. LinkedIn Easy Apply + ApplicantSync (applicant export)

### 5.1 Job posting setup (per job)

1. Create/edit job on LinkedIn → set to **Easy Apply** (not External Apply).
2. Screening questions → Add → Custom question: "Please enter your email address so we can send you the next steps."
3. Set type: Short answer. Mark: Required. Publish.

### 5.2 Install Chrome extension (one-time)

Install **[ApplicantSync](https://www.applicantsync.com)** (free, unlimited) in Chrome. Alternative: [LinkedIn Job Applicants Exporter](https://chromewebstore.google.com/detail/gpncmkeondkmbbchjekdilncigiphljb).

### 5.3 Export applicants (per campaign)

1. Open the job posting → Applicants tab in Chrome.
2. Click the ApplicantSync extension icon → Export All → save as Google Sheet.
3. Share the Google Sheet with the service account email (§4.5).
4. In the app dashboard: Create Campaign → Import → paste the Sheet URL → map columns → confirm.

---

## 6. Gmail API — reply detection (v0.3+)

For detecting "Confirmed" replies to Stage-2 interview invite emails.

1. In Google Cloud Console (same project as §4), enable **Gmail API**.
2. OAuth consent screen → External → fill required fields → add scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Credentials → Create OAuth Client ID → Web application.
4. Copy Client ID and Secret to `.env.local`:
   ```
   GMAIL_CLIENT_ID=...
   GMAIL_CLIENT_SECRET=...
   ```
5. Generate a refresh token using the OAuth playground or a one-time script (documented when v0.3 starts).

---

## 7. Vercel (production deployment)

1. <https://vercel.com> → Add New → Project → import `A4Gcollab/Recruitment-automation`.
2. Add all env vars from `.env.local` under Settings → Environment Variables (use the Neon URL for `DATABASE_URL`, not the local one).
3. Deploy. Copy the production URL → set as `NEXTAUTH_URL`.

---

## 8. UptimeRobot (free cron trigger)

Vercel Hobby cron is limited to 1/hour. UptimeRobot pings our cron endpoints every 5 minutes for free.

1. Create account at <https://uptimerobot.com>.
2. Add monitors (HTTP, 5-min interval) for each cron endpoint:
   - `https://your-app.vercel.app/api/cron/process-queue` (v0.1+)
   - `https://your-app.vercel.app/api/cron/poll-forms` (v0.2+)
   - `https://your-app.vercel.app/api/cron/check-reminders` (v0.3+)
   - `https://your-app.vercel.app/api/cron/poll-replies` (v0.3+)
   - `https://your-app.vercel.app/api/health` (uptime)
3. Each endpoint validates a `CRON_SECRET` header — set the same secret in UptimeRobot's custom headers and Vercel env vars.

---

## 9. First-run checklist

- [ ] `.env.local` populated.
- [ ] `sudo service postgresql start` (or Neon connected).
- [ ] `npm run db:migrate && npm run db:seed` ran cleanly.
- [ ] Login works at `/login`.
- [ ] Gmail test email sends successfully (check spam folder too).
- [ ] Google Sheet shared with service account email.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Pre-commit hook rejects commit | `git config --local user.name "SnehaChouksey"` + `user.email` |
| `$` in bcrypt hash breaks login | Escape with `\$` in `.env.local` (e.g. `\$2a\$10\$...`) |
| Gmail "Less secure apps" error | Use App Password, not account password (§3) |
| Google Sheets 403 | Share the sheet with the service account email (§4.5) |
| Email lands in spam | Check sender name isn't raw Gmail address; personalise subject line |
