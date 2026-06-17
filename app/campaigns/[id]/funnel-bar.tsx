"use client";

// Ordered pipeline stages — only those with candidates are shown, but key
// stages always appear (even at 0) so HR can see the full funnel shape.
const STAGE_ORDER: { id: string; label: string; always?: boolean }[] = [
  { id: "imported", label: "Imported", always: true },
  { id: "good_fit", label: "Good Fit" },
  { id: "stage1_sent", label: "Stage 1 Sent", always: true },
  { id: "evaluated_screen1", label: "Evaluated" },
  { id: "stage2", label: "Shortlisted", always: true },
  { id: "interview_link_sent", label: "Invited", always: true },
  { id: "confirmed", label: "Confirmed" },
  { id: "rejected", label: "Rejected" },
];

const STAGE_COLORS: Record<string, string> = {
  imported: "bg-slate-400",
  good_fit: "bg-blue-400",
  stage1_sent: "bg-blue-500",
  evaluated_screen1: "bg-violet-500",
  stage2: "bg-amber-500",
  interview_link_sent: "bg-orange-500",
  confirmed: "bg-emerald-500",
  rejected: "bg-rose-400",
};

const STAGE_TEXT: Record<string, string> = {
  imported: "text-slate-600 dark:text-slate-400",
  good_fit: "text-blue-600 dark:text-blue-400",
  stage1_sent: "text-blue-700 dark:text-blue-300",
  evaluated_screen1: "text-violet-700 dark:text-violet-300",
  stage2: "text-amber-700 dark:text-amber-300",
  interview_link_sent: "text-orange-700 dark:text-orange-300",
  confirmed: "text-emerald-700 dark:text-emerald-300",
  rejected: "text-rose-600 dark:text-rose-400",
};

export function FunnelBar({
  countsByStage,
}: {
  countsByStage: { stage: string; count: number }[];
}) {
  const countMap = new Map(countsByStage.map((r) => [r.stage, r.count]));
  const total = countsByStage.reduce((s, r) => s + r.count, 0);

  // Build display list: always-shown stages + any other stages with counts
  const knownIds = new Set(STAGE_ORDER.map((s) => s.id));
  const extraStages = countsByStage
    .filter((r) => !knownIds.has(r.stage) && r.count > 0)
    .map((r) => ({ id: r.stage, label: r.stage.replace(/_/g, " ") }));

  const displayStages = [
    ...STAGE_ORDER.filter(
      (s) => s.always || (countMap.get(s.id) ?? 0) > 0
    ),
    ...extraStages,
  ];

  if (total === 0) return null;

  return (
    <div className="mt-3">
      {/* Bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {displayStages.map((s) => {
          const count = countMap.get(s.id) ?? 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          const color = STAGE_COLORS[s.id] ?? "bg-slate-400";
          return (
            <div
              key={s.id}
              className={`${color} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${count}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {displayStages.map((s) => {
          const count = countMap.get(s.id) ?? 0;
          const dot = STAGE_COLORS[s.id] ?? "bg-slate-400";
          const text = STAGE_TEXT[s.id] ?? "text-slate-600 dark:text-slate-400";
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${dot} shrink-0`} />
              <span className={`text-[11px] font-medium ${text}`}>
                {s.label}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
