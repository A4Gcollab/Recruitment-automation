# DEPLOYMENT

Step-by-step setup for A4G LinkedIn Recruitment Automation. Follow top-to-bottom the first time.

- **Prereqs:** GitHub access to `A4Gcollab/Recruitment-automation`, a Google Cloud account, a Gmail account for sending, Node 22+, `npm` 10+.
- **Stack:** Next.js 15 · PostgreSQL (local: WSL; prod: Docker on a Vultr VPS) · Vultr VPS + Docker Compose · system nginx + certbot (TLS) · Gmail SMTP · Google Sheets API · Gmail API. See `PRD_v2.1.md` for rationale.
- **Deployment target (2026-06-01):** self-hosted **Vultr VPS** (not Vercel) at `139.84.154.64`, domain `RecSup.omysha.org`. App + Postgres run as a Docker Compose stack; the box's **existing system nginx** reverse-proxies to the app and certbot handles TLS; cron is the VPS's native `cron`. ~$6/mo — this replaces the prior $0/mo Vercel+Neon design.
- **Secrets:** every variable in `CONTRACTS.md §1` lives in `.env.local` locally and `.env.production` on the VPS. Nothing is `NEXT_PUBLIC_`.

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

### 2b. Production — Postgres on the Vultr VPS

Production Postgres runs as a Docker container on the VPS (no Neon). It is
created and managed by `docker-compose.prod.yml` — see §7. Data persists in the
`a4g-prod-pgdata` Docker volume. The DB is **not** published to the public
internet; only the app container reaches it over the internal compose network.
`DATABASE_URL` therefore uses the service hostname `db` (e.g.
`postgres://postgres:<password>@db:5432/a4g_prod`).

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

## 7. Vultr VPS (production deployment)

This VPS (`139.84.154.64`) already runs a **system nginx** on :80/:443 serving
other sites, so we **reuse that nginx** as the reverse proxy rather than running
our own. The app + Postgres run as a Docker Compose stack
(`docker-compose.prod.yml`); the app is published on `127.0.0.1:3000` (loopback
only), and nginx proxies `RecSup.omysha.org` to it with TLS from certbot.

**Prereqs:** SSH access to the VPS (sudo), Docker + the nginx/certbot already on
the box, and DNS resolving.

### 7.1 Point the domain at the VPS

At the DNS provider for `omysha.org`, add an **A record**:
`RecSup.omysha.org` → `139.84.154.64`. Confirm it resolves:
`dig +short RecSup.omysha.org` → `139.84.154.64`.

### 7.2 Ensure Docker is present (one-time)

```bash
docker --version || curl -fsSL https://get.docker.com | sh
# allow your user to run docker without sudo (log out/in after):
sudo usermod -aG docker $USER
```
nginx, certbot, and the firewall are already configured on this box (other sites
use them) — do **not** reset them.

### 7.3 Get the code + secrets onto the VPS

```bash
git clone https://github.com/A4Gcollab/Recruitment-automation.git
cd Recruitment-automation
git config --local user.name  "SnehaChouksey"
git config --local user.email "snehachoukseyobc@gmail.com"

cp .env.production.example .env.production
nano .env.production        # fill in every value (see notes below)
```

In `.env.production`:
- `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must match. `DATABASE_URL`
  uses host `db` (the container): `postgres://postgres:<pw>@db:5432/a4g_prod`.
- `NEXTAUTH_URL` = `https://RecSup.omysha.org`.
- Generate secrets: `openssl rand -base64 32` (NEXTAUTH_SECRET), `openssl rand -hex 24` (CRON_SECRET).
- Paste the Google service-account private key as a single double-quoted line with `\n`
  for newlines (same form as `.env.local`).

`.env.production` holds live secrets — it is git-ignored; never commit it.

### 7.4 Launch the app + DB

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

First run only — create the schema and seed the 9 stages:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
    run --rm app sh -c "npm run db:migrate && npm run db:seed"
```

Confirm the app answers locally (before wiring nginx):
`curl -I http://127.0.0.1:3000` → `200`/`307`.

### 7.5 Add the nginx vhost + TLS (reusing the box's nginx)

```bash
sudo cp deploy/nginx/RecSup.omysha.org.conf /etc/nginx/sites-available/RecSup.omysha.org
sudo ln -s /etc/nginx/sites-available/RecSup.omysha.org /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx     # -t verifies it won't break other sites
sudo certbot --nginx -d RecSup.omysha.org        # issues + wires the cert for THIS domain only
```

Visit `https://RecSup.omysha.org`. certbot auto-renews via its existing timer.

### 7.6 Redeploying after a code change

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
# run migrations again only if new DB migrations landed:
docker compose --env-file .env.production -f docker-compose.prod.yml \
    run --rm app sh -c "npm run db:migrate"
```

Useful: `docker compose -f docker-compose.prod.yml logs -f app` (logs),
`... ps` (status), `... down` (stop; data persists in the volume).

---

## 8. Cron (native VPS crontab)

The VPS runs real cron, so no external pinger is needed. Each cron endpoint
authenticates with `Authorization: Bearer <CRON_SECRET>`.

Edit the crontab (`crontab -e`) and add a line per **endpoint that exists**. As of
v0.3.1 only `process-queue` is built; add the others as they ship.

```cron
# Use the same CRON_SECRET value as in .env.production
*/5 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://RecSup.omysha.org/api/cron/process-queue >/dev/null 2>&1
# v0.2+  */5 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://RecSup.omysha.org/api/cron/poll-forms      >/dev/null 2>&1
# v0.3+  */5 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://RecSup.omysha.org/api/cron/check-reminders >/dev/null 2>&1
# v0.3+  */5 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://RecSup.omysha.org/api/cron/poll-replies    >/dev/null 2>&1
```

---

## 9. First-run checklist

- [ ] `.env.local` populated.
- [ ] Local: `sudo service postgresql start`. Prod: the `db` container is up (`docker compose -f docker-compose.prod.yml ps`).
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
