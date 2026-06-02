<div align="center">

# 🌱 A4G Recruitment Automation

**A streamlined hiring dashboard that turns a manual LinkedIn → screening → interview funnel into a few clicks.**

Built for the non-profit **VONG Movement · AI for Good (A4G) Impact Collaborative / Omysha Foundation** to run volunteer & talent recruitment at zero marketing spend.

[![Live](https://img.shields.io/badge/live-recsup.omysha.org-22c55e?style=flat-square)](https://recsup.omysha.org)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=flat-square&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-deployed-2496ed?style=flat-square&logo=docker&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)

</div>

---

## Overview

Recruiting through LinkedIn means juggling spreadsheets, copy-pasting emails one by one, chasing form responses, and losing track of where each candidate stands. **A4G Recruitment Automation** replaces that with a single dashboard:

- **Bulk-import** shortlisted ("good-fit") applicants — with their emails — from LinkedIn.
- **Send personalised screening and interview emails** to many candidates at once.
- **Pull Google Form responses** back in automatically and advance candidates.
- **Track every candidate's stage** end to end, with a full audit trail.

It's a **human-in-the-loop** tool: the app does the repetitive heavy lifting; a recruiter still makes the judgement calls (using ChatGPT as a manual assistant for reviews). No black-box automated scoring.

> **Live:** https://recsup.omysha.org · Runs on a single small VPS for **~$6/month**.

---

## ✨ Features

- 🎯 **Smart two-file import** — match a LinkedIn "good-fit" shortlist against a full applicant export to import *only* the right candidates, complete with emails and profile details.
- 📧 **Bulk, personalised email** — Stage-1 screening and Stage-2 interview emails via Gmail SMTP, with per-campaign templates, merge fields, rate-limiting and a sending-time window.
- 📋 **Google Form integration** — pull screening-form responses, match them to candidates by email, and advance their stage automatically.
- 🔄 **ChatGPT-assisted review** — export candidates to a spreadsheet, review with ChatGPT, and re-import verdicts (XLSX round-trip).
- 🗂️ **Stage tracking & audit log** — every candidate flows through clear stages; every change is recorded.
- 🧩 **LinkedIn applicant exporter** — a companion browser userscript that scrapes the filtered applicant list to CSV.
- 🔐 **Secure single-admin login**, **idempotent** sends and imports (safe to retry), and **kill-switch** + rate controls for email.

---

## 🔧 How it works

```
LinkedIn job (Easy Apply, with a mandatory "your email" screening question)
   │
   ├─ Export GOOD-FIT applicants → browser userscript → CSV (names of good-fit candidates)
   └─ Export ALL applicants       → ApplicantSync       → sheet (names + emails + details)
   │
   ▼
Two-file "filtered import": match good-fit names against the full export
   → imports only good-fit candidates, WITH their emails, into a campaign
   ▼
Bulk Stage-1 email  (screening Google Form link, sent via Gmail SMTP)
   ▼
Candidates fill the Google Form
   ▼
"Pull form responses": match by email → advance candidates to "form submitted"
   ▼
Export → review with ChatGPT (manual) → re-import verdicts
   ▼
Bulk Stage-2 email  (interview invite: video-call link, date & time)
```

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| **Backend** | Next.js Route Handlers, NextAuth v5 (single-admin), Zod validation |
| **Data** | PostgreSQL 16, Drizzle ORM (typed schema + migrations) |
| **Email** | Nodemailer + Gmail SMTP (rate-limited, time-windowed, idempotent queue) |
| **Integrations** | Google Sheets API (service account), Tampermonkey userscript |
| **Infra** | Docker Compose, nginx reverse proxy, Let's Encrypt TLS, native cron, Vultr VPS |

---

## 🏗️ Architecture

A self-contained Docker Compose stack on one VPS:

- **`app`** — the Next.js server (rendered UI + API), reachable only on localhost.
- **`db`** — PostgreSQL, on a private network (never exposed publicly).
- The host's **nginx** reverse-proxies the public domain to the app and terminates **HTTPS** (auto-renewing Let's Encrypt cert).
- **System cron** pings the app's internal cron endpoint to process the email queue.

Email sends are queued and processed within a configurable IST time-window and hourly cap, with idempotency keys so retries never double-send.

---

## 📁 Project structure

```
.
├── app/                    # Next.js App Router
│   ├── api/                #   backend endpoints (campaigns, candidates, import, emails, cron)
│   ├── dashboard/          #   campaign list + create-campaign
│   ├── campaigns/[id]/     #   candidate table + import / send / pull-responses dialogs
│   └── login/              #   admin authentication
├── components/             # UI components (shadcn/ui + app-specific)
├── lib/                    # server logic: email (templates/sender), sheets, serializers, types
├── db/                     # Drizzle schema, migrations, seed
├── scripts/userscripts/    # Tampermonkey LinkedIn good-fit exporter (.user.js)
├── deploy/nginx/           # production nginx vhost
├── docs/                   # documentation (start at docs/README.md)
├── Dockerfile              # production app image
└── docker-compose.prod.yml # production stack (app + Postgres)
```

---

## 🚀 Getting started (local)

**Prerequisites:** Node 22+, Docker.

```bash
# 1. Local Postgres
docker compose up -d postgres

# 2. Install & configure
npm install
cp .env.example .env.local        # set Gmail, Google service account, admin login, secrets

# 3. Database
npm run db:migrate
npm run db:seed                   # seeds candidate stages

# 4. Run
npm run dev                       # → http://localhost:3000
```

Handy scripts: `npm run build` · `npm run lint` · `npm run typecheck` · `npm run db:studio`.

---

## ☁️ Deployment

Production runs as a Docker Compose stack on a Vultr VPS behind nginx with Let's Encrypt TLS. The complete step-by-step guide (DNS, secrets, nginx vhost, certbot, cron) is in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## 📚 Documentation

All docs live in **[`docs/`](docs/README.md)** — deployment runbook, API/env/type contracts, product requirements, and design history.

---

## 👤 Author

**Sneha Chouksey** — AI Product Lead -A4G Impact Collaborative(Omysha Foundation).

<sub>© 2026 A4G Impact Collaborative / Omysha Foundation. All rights reserved.</sub>
