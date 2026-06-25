# Workflow Diagram — Image Generation Prompt

A ready-to-use prompt for an image LLM (works best with **GPT-4o image / Gemini / Ideogram**, which render in-image text better than Midjourney) to produce a showcase diagram of the recruitment tool's workflow and tech stack.

---

## Prompt

> Create a clean, modern **horizontal infographic / architecture-flow diagram** titled **"A4G Recruitment Automation — Workflow & Tech Stack"**, in a professional flat-design style suitable for a LinkedIn showcase. 16:9 landscape, generous white space, rounded cards, thin connector arrows, subtle drop shadows, line-style icons.
>
> **Color palette:** deep navy (#08243F), LinkedIn-style blue (#0A66C2), light sky-blue accents, and a green (#22C55E) for success/final steps; white background; dark-grey text. Cohesive and corporate-friendly.
>
> **Top section — a left-to-right pipeline of 8 connected stages**, each a rounded card with a small icon, a short bold title, and one tiny caption line:
> 1. **LinkedIn Job** — Easy Apply post with a mandatory "email" screening question (LinkedIn icon)
> 2. **Export Applicants** — two sources merging: a *browser userscript* (good-fit shortlist) + *ApplicantSync* (names + emails) (browser/extension icon)
> 3. **Smart Import** — two-file match by name → candidates with emails land in the app (merge/funnel icon)
> 4. **Stage-1 Email** — bulk personalised screening email with a Google Form link (envelope icon)
> 5. **Google Form** — candidates submit screening responses (clipboard/form icon)
> 6. **Pull Responses** — auto-match by email, advance candidate stage (sync/refresh icon)
> 7. **ChatGPT Review** — export → human reviews with ChatGPT → import verdicts (sparkle/AI icon)
> 8. **Stage-2 Invite** — bulk interview-invite email with video-call link & time (calendar icon, green accent)
>
> Show clean arrows flowing left→right between the eight cards. Optionally add a thin "Candidate stages" progress bar beneath the pipeline reading: Imported → Good-fit → Stage-1 Sent → Form Submitted → Evaluated → Interview → Confirmed.
>
> **Bottom section — a "Tech Stack" band** grouped into labeled clusters of small logo-style chips:
> - **Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
> - **Backend:** Next.js API routes, NextAuth, Zod
> - **Data:** PostgreSQL, Drizzle ORM
> - **Email & Integrations:** Nodemailer + Gmail SMTP, Google Sheets API, Tampermonkey userscript
> - **Infrastructure:** Docker, nginx, Let's Encrypt (HTTPS), Cron, Vultr VPS
>
> **Style requirements:** minimal and uncluttered, crisp legible sans-serif text, consistent icon weights, balanced composition, no photorealism, no clip-art, no human faces. Make it look like a polished product diagram from a modern SaaS landing page.

---

## Tips

- Image models often garble longer text labels. Keep the wording above, but if labels come out misspelled, regenerate or shorten the captions.
- For **perfectly accurate text**, a code-rendered diagram (e.g. Mermaid) is more reliable than an AI image — paste a Mermaid flowchart into <https://mermaid.live> and export a PNG.
