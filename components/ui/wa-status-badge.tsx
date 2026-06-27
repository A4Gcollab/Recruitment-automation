"use client";

import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  sent: {
    label: "Sent",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  delivered: {
    label: "Delivered",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  read: {
    label: "Read",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  replied: {
    label: "Replied",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  stage1_replied: {
    label: "S1 Replied",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  stage2_replied: {
    label: "S2 Replied",
    className: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  failed: {
    label: "Failed",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
};

export function WaStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs italic text-muted-foreground">—</span>;
  }

  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-secondary text-secondary-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
