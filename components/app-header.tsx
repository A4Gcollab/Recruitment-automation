import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Purely-presentational top bar shown across authenticated pages. No data
 * fetching, no session logic — just consistent branding so the tool feels
 * trustworthy to a non-technical HR user.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-3 md:px-10">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight group-hover:underline underline-offset-4">
              Omysha Foundation — Recruitment
            </span>
            <span className="text-xs text-muted-foreground">
              VONG Movement · AI for Good (A4G) Impact Collaborative
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}
