"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { patchCandidate } from "@/lib/api/candidates";

export const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "imported", label: "Imported" },
  { value: "good_fit", label: "Good Fit" },
  { value: "stage1_sent", label: "Stage-1 Sent" },
  { value: "reminder_sent", label: "Reminder Sent" },
  { value: "form_submitted", label: "Form Submitted" },
  { value: "evaluated_screen1", label: "Screen 1 — Good Fit" },
  { value: "rejected_screen1", label: "Screen 1 — Rejected" },
  { value: "stage2_sent", label: "Stage-2 Sent" },
  { value: "evaluated_screen2", label: "Screen 2 — Call for Interview" },
  { value: "rejected_screen2", label: "Screen 2 — Rejected" },
  { value: "interview_link_sent", label: "Interview Link Sent" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
];

const STAGE_COLORS: Record<string, string> = {
  imported: "text-slate-600",
  good_fit: "text-emerald-600",
  stage1_sent: "text-blue-600",
  reminder_sent: "text-amber-600",
  form_submitted: "text-violet-600",
  evaluated_screen1: "text-emerald-600",
  rejected_screen1: "text-rose-600",
  stage2_sent: "text-blue-600",
  evaluated_screen2: "text-teal-600",
  rejected_screen2: "text-rose-600",
  interview_link_sent: "text-indigo-600",
  confirmed: "text-green-600",
  rejected: "text-rose-600",
};

export function StageMoveDropdown({
  candidateId,
  currentStage,
  candidatesQueryKey,
  onStageChange,
  size = "sm",
}: {
  candidateId: string;
  currentStage: string;
  candidatesQueryKey: readonly unknown[];
  onStageChange?: (newStage: string) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (stage: string) => patchCandidate(candidateId, { stage }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: candidatesQueryKey });
      toast.success(`Moved to "${STAGE_OPTIONS.find((s) => s.value === updated.stage)?.label ?? updated.stage}"`);
      onStageChange?.(updated.stage);
    },
    onError: () => toast.error("Failed to update stage"),
  });

  const currentLabel =
    STAGE_OPTIONS.find((s) => s.value === currentStage)?.label ?? currentStage;
  const currentColor = STAGE_COLORS[currentStage] ?? "text-slate-600";

  const padding = size === "md" ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[11px]";

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={mutation.isPending}
        className={`flex items-center gap-1 rounded-md border border-slate-200 bg-white font-medium transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 ${padding} ${currentColor}`}
      >
        {mutation.isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : null}
        {currentLabel}
        <ChevronDown className="size-3 text-slate-400" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          />
          {/* Dropdown */}
          <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {STAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (opt.value !== currentStage) mutation.mutate(opt.value);
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-[11px] transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                  opt.value === currentStage
                    ? "bg-slate-50 font-semibold dark:bg-slate-700"
                    : ""
                } ${STAGE_COLORS[opt.value] ?? "text-slate-600"}`}
              >
                {opt.value === currentStage && (
                  <span className="mr-1.5">✓</span>
                )}
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
