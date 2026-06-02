import { Badge } from "@/components/ui/badge";

/**
 * Presentational mapping from a candidate `stage` string (see db/seed.ts) to a
 * colour + human label. This NEVER changes the underlying value — it only
 * styles it. Unknown / future stages fall back to a neutral pill showing the
 * raw value, so nothing ever silently disappears.
 */
const STAGE_STYLES: Record<string, { label: string; className: string }> = {
  // intake
  imported: {
    label: "Imported",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  good_fit: {
    label: "Good Fit",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  // stage-1 flow
  stage1_sent: {
    label: "Stage-1 Sent",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  reminder_sent: {
    label: "Reminder Sent",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  form_submitted: {
    label: "Form Submitted",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  // screen-1
  evaluated: {
    label: "Evaluated",
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  },
  evaluated_screen1: {
    label: "Screen 1 — Good Fit",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  rejected_screen1: {
    label: "Screen 1 — Rejected",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
  // screen-2
  stage2_sent: {
    label: "Stage-2 Sent",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  evaluated_screen2: {
    label: "Screen 2 — Call for Interview",
    className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  },
  rejected_screen2: {
    label: "Screen 2 — Rejected",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
  // interview
  interview_link_sent: {
    label: "Interview Link Sent",
    className:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  confirmed: {
    label: "Confirmed",
    className:
      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
};

const FALLBACK_CLASS =
  "bg-secondary text-secondary-foreground";

export function StageBadge({ stage }: { stage: string }) {
  const match = STAGE_STYLES[stage];
  return (
    <Badge className={match ? match.className : FALLBACK_CLASS}>
      {match ? match.label : stage}
    </Badge>
  );
}
