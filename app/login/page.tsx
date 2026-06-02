import { Suspense } from "react";
import { Sparkles, Mail, CalendarClock, ListChecks } from "lucide-react";

import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in · A4G Recruitment",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#08243f] via-[#0a66c2] to-[#06182b] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* soft decorative glows */}
        <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 size-96 rounded-full bg-sky-300/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Omysha Foundation — Recruitment</p>
            <p className="text-xs text-white/70">VONG Movement · AI for Good (A4G)</p>
          </div>
        </div>

        <div className="relative max-w-md animate-in fade-in slide-in-from-bottom-3 duration-700">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Hire faster, with less busywork.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Import shortlisted applicants, send personalised screening &amp; interview
            emails in bulk, and track every candidate from application to confirmation —
            all from one dashboard.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-white/90">
            <li className="flex items-center gap-3">
              <Mail className="size-4 shrink-0 text-sky-200" aria-hidden />
              Bulk, personalised candidate emails
            </li>
            <li className="flex items-center gap-3">
              <ListChecks className="size-4 shrink-0 text-sky-200" aria-hidden />
              End-to-end stage tracking
            </li>
            <li className="flex items-center gap-3">
              <CalendarClock className="size-4 shrink-0 text-sky-200" aria-hidden />
              Automated form-response follow-up
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © 2026 A4G Impact Collaborative / Omysha Foundation
        </p>
      </aside>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center bg-muted/30 p-6 sm:p-10">
        <Suspense
          fallback={
            <div className="h-[26rem] w-full max-w-sm animate-pulse rounded-2xl bg-muted" />
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
