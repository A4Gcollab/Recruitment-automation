# DEPLOYMENT

Step-by-step setup for a fresh deployment of A4G Recruitment Automation. Follow top-to-bottom the first time. Re-runs should only need the sections that changed.

- **Prereqs:** a GitHub login with access to `A4Gcollab/Recruitment-automation`, a Neon account, a Vercel account, a Google Cloud account, Node 22+, and `npm` 10+.
- **Stack lock:** Next.js 15 · Neon Postgres · Vercel Hobby · Resend · Snov.io. See `PRD.md §5` for rationale.
- **Secrets convention:** every variable listed in `CONTRACTS.md §1` lives in `.env.local` locally and in Vercel Project → Settings → Environment Variables in production. Nothing is prefixed `NEXT_PUBLIC_`.

---

## 1. Local bootstrap

```bash
git clone https://github.com/A4Gcollab/Recruitment-automation.git
cd Recruitment-automation
npm install
cp .env.example .env.local
```

The pre-commit hook at `.githooks/pre-commit` is already wired via `core.hooksPath`. First commit you attempt will fail until your repo identity matches:

```bash
git config --local user.name  "SnehaChouksey"
git config --local user.email "snehachoukseyobc@gmail.com"
```

See the **Git identity (hard rule)** section of `README.md`.

---

## 2. Neon (Postgres)

1. Sign in at <https://console.neon.tech>.
2. **Create project** → name `a4g-recruitment`, region closest to A4G users (e.g. `aws-ap-southeast-1`), Postgres 16.
3. On the project dashboard, open **Connection details**:
   - Select **Pooled connection** and copy the URL. Paste into `.env.local` as `DATABASE_URL`.
   - *(Optional, for CI migrations only)* copy the **Direct connection** URL and paste as `DATABASE_URL_UNPOOLED`.
4. Leave **scale-to-zero** enabled (default) — this is how we stay on the free tier.
5. Back in the project dashboard, create a `main` branch snapshot so you can reset during v0.1 testing without losing anything.

Database schema is applied by the Backend agent via:

```bash
npm run db:generate   # writes SQL to /drizzle
npm run db:migrate    # applies to DATABASE_URL
```

These scripts land in v0.1; re-run `db:migrate` after each version's schema change.

---

## 3. Vercel

1. Sign in at <https://vercel.com>.
2. **Add New → Project** → import `A4Gcollab/Recruitment-automation` from GitHub. Framework preset auto-detects Next.js 15.
3. **Do not deploy yet** — first add environment variables under **Settings → Environment Variables**, one per line, for scope **Production**, **Preview**, and **Development**:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Paste the Neon pooled URL |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | After first deploy, paste the Vercel URL (e.g. `https://a4g-recruitment.vercel.app`) |
   | `ADMIN_EMAIL` | e.g. `suhani@a4gimpact.org` |
   | `ADMIN_PASSWORD_HASH` | `node -e "console.log(require('bcryptjs').hashSync('PASSWORD',10))"` |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | From §4 below |
   | `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | From §4 below — paste with real newlines, surrounded by `"…"` |

4. **Storage → Add Database → Neon** → link the existing Neon project. Vercel will inject `DATABASE_URL` automatically on the Vercel side; overwrite only if it differs from what you pasted.
5. Click **Deploy**. Once the first deploy completes, copy the production URL and update `NEXTAUTH_URL`, then redeploy.
6. Cron (lands in v0.6): a `vercel.json` at the repo root will register one cron job. Vercel Hobby allows one hourly cron — no action needed until v0.6.

---

## 4. Google Service Account (Sheets import)

The app authenticates to Google Sheets using a **service account** (never a human OAuth flow). Each candidate source sheet is shared with the service account's email address.

### 4.1 Create a Google Cloud project

1. Go to <https://console.cloud.google.com>.
2. Top bar → **Select a project → New project**.
3. Name: `a4g-recruitment`. Leave the organisation as-is. **Create**.

### 4.2 Enable the Sheets API

1. In the new project, sidebar → **APIs & Services → Library**.
2. Search **Google Sheets API** → **Enable**.

### 4.3 Create the service account

1. Sidebar → **IAM & Admin → Service Accounts → Create service account**.
2. Name: `a4g-sheets-reader`. Service account ID auto-fills.
3. Skip the "Grant this service account access to project" step (no project roles needed — access is per-sheet).
4. Skip "Grant users access". **Done**.
5. On the service account list, click the new account → **Keys** tab → **Add Key → Create new key → JSON** → **Create**. A JSON file downloads. **Do not commit it.**

### 4.4 Extract env vars from the JSON

Open the downloaded JSON. You need two fields:

- `client_email` → paste into `.env.local` as `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
- `private_key` → paste into `.env.local` as `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Wrap in double quotes so the embedded `\n` survives:

  ```
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n"
  ```

In Vercel, paste the private key value **with real newlines** (Vercel's UI allows multiline values).

### 4.5 Share each source sheet with the service account

For every Google Sheet that the HR team wants to import:

1. Open the sheet in Google Drive.
2. Click **Share** (top right).
3. Paste the `GOOGLE_SERVICE_ACCOUNT_EMAIL` value as a person → role **Viewer** → **Send**. (Uncheck "Notify people" — the service account doesn't read email.)

That's it — the app can now read that sheet. No further Google Cloud setup until v0.7 enables two-way sync (which requires **Editor** access on the campaign tracker sheet).

### 4.6 Rotate keys

Service account keys do not expire automatically. Rotate at least every 12 months or when a collaborator leaves the team: **Service Accounts → a4g-sheets-reader → Keys → Add key** (new), then delete the old one. Update `.env.local` and Vercel.

---

## 5. First-run checklist

Before you hit "Import candidates" for the first time:

- [ ] `.env.local` populated from `.env.example`.
- [ ] `npm run db:migrate` ran cleanly.
- [ ] You can log in at `/login` with `ADMIN_EMAIL` + the password you hashed.
- [ ] The target Google Sheet is shared with `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
- [ ] Header row of the sheet has at minimum a **name** column and a **role** column (email and LinkedIn URL are optional — they can be enriched later).

---

## 6. Rollback

Vercel retains every deployment. Project dashboard → **Deployments** → pick a previous one → **Promote to Production**. Zero-downtime.

Database schema rollbacks are manual: Drizzle emits plain SQL migration files in `drizzle/`. Reverse the last migration against Neon via the Neon console. Always test migrations on a Neon **branch** before applying to production — branching is free.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `fatal: Authentication failed` on `git push` | `gh.exe` keyring not active as SnehaChouksey | `gh auth switch --user SnehaChouksey` then retry |
| Pre-commit hook rejects every commit | Repo-local `user.name`/`user.email` don't match | Run the two `git config --local` commands in §1 |
| `Error: connect ECONNREFUSED` from Neon | Pooled URL used for migrations | Use `DATABASE_URL_UNPOOLED` for `db:migrate` |
| `403` from Sheets API | Sheet isn't shared with the service account | §4.5 |
| `PERMISSION_DENIED: private_key` | `\n` in the private key got stripped | Re-paste with real newlines (or escaped `\n` inside double quotes) |
