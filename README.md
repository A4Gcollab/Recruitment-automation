# A4G LinkedIn Recruitment Automation

Zero-cost automated recruitment pipeline for A4G Impact Collaborative / Omysha Foundation. LinkedIn Easy Apply → Google Form screening → automated evaluation → interview invite — all via email.

## Key docs

- `PRD_v2.1.md` — the authoritative Technical PRD (v2.1 Final, April 2026)
- `BUILD_PLAN.md` — multi-agent build plan: versions v0.1 → v0.4, agent roles, tmux setup
- `PROGRESS.md` — current version, work specs, and status tracker (read this first)
- `CONTRACTS.md` — API/env/type contracts shared between agents
- `DEPLOYMENT.md` — setup guide: PostgreSQL, Gmail SMTP, Google service account, Vercel
- `docs/multi-claude-setup-guide.md` — tmux + WSL multi-Claude setup

## The team

Four Claude agents in one tmux session, each with a name + lane (ownership table in `BUILD_PLAN.md §1`):

| Pane | Name | Role |
|---|---|---|
| `a4g:0.0` | **Orion** | Orchestrator — reviews PRs, merges to `main`, owns framework config + docs |
| `a4g:0.1` | **Basil** | Backend — Drizzle schema, API routes, NextAuth, email send logic, evaluation engine |
| `a4g:0.2` | **Fern** | Frontend — dashboard pages, campaign management, approval gates, candidate views |
| `a4g:0.3` | **Iris** | Integrations — Google Sheets API, Gmail API, Nodemailer transport |

All four commit as `SnehaChouksey <snehachoukseyobc@gmail.com>` — names are collaboration shorthand.

## Stack snapshot

Next.js 15 App Router · TypeScript · Tailwind · shadcn/ui · Drizzle ORM · PostgreSQL (Neon) · NextAuth v5 · Nodemailer + Gmail SMTP · Google Sheets API v4 · Gmail API · TanStack Query · Vercel Hobby · UptimeRobot

## Pipeline overview

```
LinkedIn Easy Apply (free, mandatory email question)
  → HR exports via ApplicantSync Chrome extension (free) → Google Sheet
  → App imports from Google Sheet → PostgreSQL
  → Stage-1 email: screening Google Form link (Gmail SMTP, rate-limited)
  → Google Sheets poller detects form responses (every 5 min)
  → Evaluation engine: Tier 1 deal-breakers + Tier 2 quality → PASS / FAIL / REVIEW
  → T+20h reminder for non-responders (exactly one per candidate)
  → PASS → Stage-2 interview invite email (Zoom link, date/time)
  → Gmail API detects "Confirmed" replies → pipeline complete
```

**Total monthly cost: $0.** All tools run on free tiers.

## Quick start for agents

1. Open WSL terminal in `/mnt/d/workspace/Linkedin-automation`.
2. Launch: `~/claude-session.sh a4g 4` (see `docs/multi-claude-setup-guide.md`).
3. Paste the role prompt from `BUILD_PLAN.md §3` into each pane.
4. Read `PROGRESS.md` for current version + your work spec.
5. Read `CONTRACTS.md` for interfaces to consume or publish.

## Git identity (hard rule)

Every commit must be authored by `SnehaChouksey <snehachoukseyobc@gmail.com>`. Enforced by `.githooks/pre-commit`.

- **Remote:** `https://github.com/A4Gcollab/Recruitment-automation.git`
- **Set identity:** `git config --local user.name "SnehaChouksey"` + `git config --local user.email "snehachoukseyobc@gmail.com"`
- **Never** use `--no-verify`, `--force` to main, or `reset --hard`.
- **Push auth:** `scripts/git-credential-gh.sh` reads from Windows `gh.exe` keyring.
