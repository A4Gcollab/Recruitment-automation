# A4G Recruitment Automation

Zero-recurring-cost recruitment automation platform for A4G Impact Collaborative / Omysha Foundation. Next.js 15 + Neon Postgres + Resend + Kanban pipeline.

## Key docs

- `PRD.md` — the full Technical PRD (v1.0, April 2026)
- `BUILD_PLAN.md` — multi-agent build plan: versions v0.1 → v1.0, agent roles, tmux setup
- `PROGRESS.md` — current version, work specs, and status tracker (read this first)
- `CONTRACTS.md` — authoritative API/env/payload contracts shared between agents
- `docs/multi-claude-setup-guide.md` — tmux + WSL multi-Claude setup

## Quick start for agents

1. Open WSL terminal in `/mnt/d/workspace/Linkedin-automation`.
2. Launch the session: `~/claude-session.sh a4g 4` (see `docs/multi-claude-setup-guide.md`).
3. Paste the relevant role prompt from `BUILD_PLAN.md` §3 into each pane.
4. Read `PROGRESS.md` to see which version is active and what your agent owns.
5. Read `CONTRACTS.md` for the interfaces to consume or publish.

## Stack snapshot

Next.js 15 App Router · TypeScript · Tailwind · shadcn/ui · Drizzle ORM · Neon Postgres · NextAuth v5 · Resend · Snov.io · @dnd-kit · TanStack Query · Vercel (Hobby) · Vercel Cron · UptimeRobot
