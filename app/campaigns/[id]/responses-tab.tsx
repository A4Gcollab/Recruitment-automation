"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fetchStoredFormResponses,
  pullResponses,
  shortlistForStage2,
  type StoredFormResponse,
  type CampaignDetail,
} from "@/lib/api/candidates";
import { candidatesQueryKey } from "./candidates-table";

// Questions to show as summary columns (short labels)
const SUMMARY_KEYS = [
  { label: "Tech capability", match: /Q6/i },
  { label: "AI/LLM exp.", match: /Q7/i },
  { label: "5–9 PM avail.", match: /Q13/i },
  { label: "30 hrs/wk", match: /Q14/i },
];

function findAnswer(responses: Record<string, string>, match: RegExp): string {
  const key = Object.keys(responses).find((k) => match.test(k));
  return key ? (responses[key] ?? "—") : "—";
}

function truncate(s: string, n = 80) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function stagePill(stage: string) {
  if (stage === "stage2")
    return (
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
        Stage 2
      </span>
    );
  if (stage === "stage2_sent")
    return (
      <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-900 dark:text-violet-200">
        Stage 2 Sent
      </span>
    );
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      {stage.replace(/_/g, " ")}
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function ResponseRow({
  item,
  selected,
  onToggle,
}: {
  item: StoredFormResponse;
  selected: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const allKeys = Object.keys(item.responses);

  return (
    <>
      <tr
        className={`border-t border-slate-100 transition-colors dark:border-slate-800 ${
          selected
            ? "bg-violet-50/60 dark:bg-violet-950/20"
            : "hover:bg-slate-50/40 dark:hover:bg-slate-800/30"
        }`}
      >
        {/* Checkbox */}
        <td className="w-10 px-4 py-3">
          <Checkbox
            checked={selected}
            onCheckedChange={(next) => onToggle(item.candidate_id, Boolean(next))}
          />
        </td>

        {/* Name + stage */}
        <td className="px-3 py-3">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {item.candidate_name}
          </p>
          <p className="text-[11px] text-slate-400">{item.candidate_email ?? "—"}</p>
        </td>

        {/* Stage */}
        <td className="px-3 py-3">{stagePill(item.candidate_stage)}</td>

        {/* Submitted */}
        <td className="px-3 py-3 text-xs text-slate-500">{formatDate(item.submitted_at)}</td>

        {/* Summary answer columns */}
        {SUMMARY_KEYS.map(({ label, match }) => (
          <td key={label} className="max-w-[140px] px-3 py-3 text-xs text-slate-600 dark:text-slate-400">
            {truncate(findAnswer(item.responses, match), 60)}
          </td>
        ))}

        {/* Expand toggle */}
        <td className="px-3 py-3 text-right">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "Less" : "All Q&A"}
          </button>
        </td>
      </tr>

      {/* Expanded full answers */}
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/30">
          <td colSpan={7 + SUMMARY_KEYS.length} className="px-8 py-4">
            <div className="space-y-3">
              {allKeys.map((key) => (
                <div key={key}>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {key.replace(/\n/g, " ")}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">
                    {item.responses[key] || "—"}
                  </p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ResponsesTab({
  campaignId,
  campaign,
}: {
  campaignId: string;
  campaign: CampaignDetail | undefined;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const responsesKey = ["form-responses", campaignId] as const;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: responsesKey,
    queryFn: () => fetchStoredFormResponses(campaignId),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.candidate_id));
  const hasSelection = selected.size > 0;

  function toggleOne(candidateId: string, next: boolean) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (next) s.add(candidateId);
      else s.delete(candidateId);
      return s;
    });
  }

  function toggleAll(next: boolean) {
    if (next) setSelected(new Set(items.map((i) => i.candidate_id)));
    else setSelected(new Set());
  }

  // Pull from Google Sheet
  const syncMutation = useMutation({
    mutationFn: () =>
      pullResponses(campaignId, {
        response_sheet_url: campaign?.form_response_sheet_url ?? undefined,
      }),
    onSuccess: (result) => {
      toast.success("Responses synced", {
        description: `${result.pulled} pulled · ${result.matched} matched to candidates`,
      });
      queryClient.invalidateQueries({ queryKey: responsesKey });
    },
    onError: () => toast.error("Sync failed — check the sheet URL in campaign settings"),
  });

  // Shortlist selected for Stage 2
  const shortlistMutation = useMutation({
    mutationFn: () => shortlistForStage2(campaignId, Array.from(selected)),
    onSuccess: (result) => {
      toast.success(`${result.shortlisted} candidate${result.shortlisted === 1 ? "" : "s"} moved to Stage 2`, {
        description: "Switch to the Candidates tab → Stage 2 filter to send the invitation.",
      });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: responsesKey });
      queryClient.invalidateQueries({ queryKey: candidatesQueryKey(campaignId) });
    },
    onError: () => toast.error("Shortlist failed"),
  });

  const isPending = syncMutation.isPending || shortlistMutation.isPending;

  if (!campaign?.form_response_sheet_url) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
          <CheckCircle2 className="size-6 text-slate-300" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            No response sheet linked
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Add the Google Form response sheet URL in campaign settings (⚙) to enable this tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="text-xs text-slate-400">
          {items.length} response{items.length === 1 ? "" : "s"}
          {hasSelection ? ` · ${selected.size} selected` : ""}
        </span>
        {hasSelection && (
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => syncMutation.mutate()}
            disabled={isPending || isFetching}
          >
            {syncMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Sync from Google Sheet
          </Button>
          <Button
            size="sm"
            disabled={!hasSelection || isPending}
            onClick={() => shortlistMutation.mutate()}
            className="h-8 bg-violet-600 text-xs text-white hover:bg-violet-700"
          >
            {shortlistMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <UserCheck className="size-3" />
            )}
            Shortlist for Stage 2 ({selected.size})
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-5 animate-spin text-slate-300" />
          </div>
        ) : isError ? (
          <div className="py-20 text-center text-sm text-destructive">
            Failed to load responses.{" "}
            <button onClick={() => refetch()} className="underline">
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-sm text-slate-500">No responses synced yet.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Sync now
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      disabled={items.length === 0}
                    />
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Candidate
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Stage
                  </th>
                  <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Submitted
                  </th>
                  {SUMMARY_KEYS.map(({ label }) => (
                    <th
                      key={label}
                      className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Answers
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ResponseRow
                    key={item.id}
                    item={item}
                    selected={selected.has(item.candidate_id)}
                    onToggle={toggleOne}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
