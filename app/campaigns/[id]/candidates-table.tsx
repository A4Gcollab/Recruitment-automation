"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileDown,
  FileUp,
  Inbox,
  Loader2,
  Mail,
  MessageCircle,
  Send,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StageBadge } from "@/components/ui/stage-badge";
import { WaStatusBadge } from "@/components/ui/wa-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiClientError,
  exportCandidatesUrl,
  fetchCandidates,
  importEvaluations,
  type CampaignDetail,
  type Candidate,
  type EvaluationImportResult,
} from "@/lib/api/candidates";
import { campaignQueryKey } from "./campaign-detail-view";
import { ImportFilteredDialog } from "./import-filtered-dialog";
import { PullResponsesDialog } from "./pull-responses-dialog";
import { SendBulkDialog } from "./send-bulk-dialog";
import { SendStage1Dialog } from "./send-stage1-dialog";
import { SendWhatsAppDialog } from "./send-whatsapp-dialog";

export function candidatesQueryKey(campaignId: string) {
  return ["candidates", { campaign_id: campaignId }] as const;
}

type StageFilter =
  | "all"
  | "imported"
  | "stage1_sent"
  | "replied"
  | "interview"
  | "no_contact";

const FILTER_LABELS: Record<StageFilter, string> = {
  all: "All",
  imported: "Imported",
  stage1_sent: "Stage-1 Sent",
  replied: "Replied",
  interview: "Interview",
  no_contact: "No Contact",
};

function matchesFilter(c: Candidate, filter: StageFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "imported":
      return c.stage === "imported";
    case "stage1_sent":
      return c.stage === "stage1_sent";
    case "replied":
      return c.wa_status === "replied";
    case "interview":
      return c.stage === "interview_link_sent";
    case "no_contact":
      return !c.wa_status;
    default:
      return true;
  }
}

export function CandidatesTable({
  campaignId,
  campaign,
  onImport,
  chatTarget,
  onChatSelect,
}: {
  campaignId: string;
  campaign: CampaignDetail | undefined;
  onImport: () => void;
  chatTarget: Candidate | null;
  onChatSelect: (candidate: Candidate) => void;
}) {
  const queryClient = useQueryClient();
  const [sendTarget, setSendTarget] = useState<Candidate | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<StageFilter>("all");
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [waBulkSendOpen, setWaBulkSendOpen] = useState(false);
  const [importFilteredOpen, setImportFilteredOpen] = useState(false);
  const [pullResponsesOpen, setPullResponsesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: candidatesQueryKey(campaignId),
    queryFn: () =>
      fetchCandidates({ campaign_id: campaignId, page: 1, page_size: 200 }),
  });

  const allCandidates = useMemo<Candidate[]>(
    () => data?.items ?? [],
    [data]
  );

  const candidates = useMemo(
    () => allCandidates.filter((c) => matchesFilter(c, activeFilter)),
    [allCandidates, activeFilter]
  );

  // Counts per filter chip
  const filterCounts = useMemo(() => {
    const counts: Record<StageFilter, number> = {
      all: allCandidates.length,
      imported: 0,
      stage1_sent: 0,
      replied: 0,
      interview: 0,
      no_contact: 0,
    };
    for (const c of allCandidates) {
      if (matchesFilter(c, "imported")) counts.imported++;
      if (matchesFilter(c, "stage1_sent")) counts.stage1_sent++;
      if (matchesFilter(c, "replied")) counts.replied++;
      if (matchesFilter(c, "interview")) counts.interview++;
      if (matchesFilter(c, "no_contact")) counts.no_contact++;
    }
    return counts;
  }, [allCandidates]);

  // Selection helpers
  const selectedCount = selected.size;
  const allSelected =
    candidates.length > 0 && candidates.every((c) => selected.has(c.id));
  const headerCheckState: boolean | "indeterminate" =
    selectedCount === 0 ? false : allSelected ? true : "indeterminate";

  function toggleOne(id: string, next: boolean) {
    setSelected((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(id);
      else updated.delete(id);
      return updated;
    });
  }

  function toggleAll(next: boolean) {
    if (next) setSelected(new Set(candidates.map((c) => c.id)));
    else setSelected(new Set());
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedCandidates = useMemo(
    () => allCandidates.filter((c) => selected.has(c.id)),
    [allCandidates, selected]
  );
  const selectedWithoutEmail = selectedCandidates.filter(
    (c) => !c.email
  ).length;
  const hasSelection = selectedCount > 0;

  // Import evaluations
  const importMutation = useMutation({
    mutationFn: (file: File) => importEvaluations(campaignId, file, "screen1"),
    onSuccess: (result: EvaluationImportResult) => {
      const unmatched = result.unmatched.length;
      toast.success("Evaluations imported", {
        description: `${result.updated} updated · ${result.matched} matched${unmatched ? ` · ${unmatched} unmatched` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: candidatesQueryKey(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaignId) });
    },
    onError: (err: unknown) => {
      toast.error("Import failed", { description: describe(err) });
    },
    onSettled: () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  function onExportClick() {
    const a = document.createElement("a");
    a.href = exportCandidatesUrl(campaignId);
    a.rel = "noreferrer";
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <>
      {/* Action toolbar */}
      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Secondary actions row */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
          <span className="mr-1 text-xs text-slate-400 dark:text-slate-500">
            {allCandidates.length} candidates
            {hasSelection ? ` · ${selectedCount} selected` : ""}
          </span>
          {hasSelection && (
            <button
              onClick={clearSelection}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              Clear
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <ToolbarButton
              icon={<Users className="size-3" />}
              label="Import filtered (2 files)"
              onClick={() => setImportFilteredOpen(true)}
            />
            <ToolbarButton
              icon={<FileDown className="size-3" />}
              label="Pull form responses"
              onClick={() => setPullResponsesOpen(true)}
              disabled={allCandidates.length === 0}
            />
            <ToolbarButton
              icon={<Download className="size-3" />}
              label="Export for ChatGPT (XLSX)"
              onClick={onExportClick}
              disabled={allCandidates.length === 0}
            />
            <ToolbarButton
              icon={
                importMutation.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FileUp className="size-3" />
                )
              }
              label={
                importMutation.isPending
                  ? "Importing…"
                  : "Import evaluations (XLSX)"
              }
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
            />
          </div>
        </div>

        {/* Primary CTAs row */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <button
            onClick={() => setWaBulkSendOpen(true)}
            disabled={!hasSelection}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MessageCircle className="size-3.5" />
            Send WhatsApp{hasSelection ? ` (${selectedCount})` : ""}
          </button>
          <button
            onClick={() => setBulkSendOpen(true)}
            disabled={!hasSelection}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-3.5" />
            Send Email{hasSelection ? ` (${selectedCount})` : ""}
          </button>

          {/* Filter chips */}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {(Object.keys(FILTER_LABELS) as StageFilter[]).map((filter) => (
              <FilterChip
                key={filter}
                label={FILTER_LABELS[filter]}
                count={filterCounts[filter]}
                active={activeFilter === filter}
                onClick={() => {
                  setActiveFilter(filter);
                  clearSelection();
                }}
              />
            ))}
            <button className="flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <SlidersHorizontal className="size-2.5" />
              Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-100 bg-slate-50/80 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50">
              <TableHead className="w-[40px]">
                <Checkbox
                  aria-label="Select all"
                  checked={headerCheckState}
                  onCheckedChange={toggleAll}
                  disabled={candidates.length === 0}
                />
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Name
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Email
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Phone
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                LinkedIn
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Stage
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Verdict
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sent
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                WA
              </TableHead>
              <TableHead className="w-[100px] text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingRows />
            ) : isError ? (
              <ErrorRow error={error} onRetry={() => refetch()} />
            ) : candidates.length === 0 && allCandidates.length === 0 ? (
              <EmptyRow onImport={onImport} />
            ) : candidates.length === 0 ? (
              <FilterEmptyRow onClear={() => setActiveFilter("all")} />
            ) : (
              candidates.map((candidate) => {
                const isChat = chatTarget?.id === candidate.id;
                return (
                  <TableRow
                    key={candidate.id}
                    data-state={
                      selected.has(candidate.id) ? "selected" : undefined
                    }
                    className={`border-slate-100 transition-colors dark:border-slate-800 ${
                      isChat
                        ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                        : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <TableCell className="py-3.5">
                      <Checkbox
                        aria-label={`Select ${candidate.full_name}`}
                        checked={selected.has(candidate.id)}
                        onCheckedChange={(next) =>
                          toggleOne(candidate.id, Boolean(next))
                        }
                      />
                    </TableCell>
                    <TableCell className="py-3.5 font-medium text-slate-900 dark:text-slate-100">
                      {candidate.full_name}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs text-slate-500">
                      {candidate.email ?? (
                        <span className="italic text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs text-slate-500">
                      {candidate.phone ?? (
                        <span className="italic text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs text-slate-500">
                      {candidate.linkedin_url ? (
                        <a
                          href={candidate.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-blue-500 hover:text-blue-700 hover:underline"
                        >
                          Profile
                        </a>
                      ) : (
                        <span className="italic text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <StageBadge stage={candidate.stage} />
                    </TableCell>
                    <TableCell className="py-3.5">
                      <VerdictChip verdict={candidate.verdict} />
                    </TableCell>
                    <TableCell className="py-3.5 text-xs text-slate-500">
                      {formatSentAt(candidate.stage1_sent_at)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <WaStatusBadge status={candidate.wa_status} />
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ActionIconButton
                          title={
                            candidate.email
                              ? "Send Stage-1 email"
                              : "No email on file"
                          }
                          disabled={!candidate.email}
                          onClick={() => setSendTarget(candidate)}
                          color="blue"
                        >
                          <Mail className="size-3" />
                        </ActionIconButton>
                        <ActionIconButton
                          title={
                            candidate.phone
                              ? "Open WhatsApp chat"
                              : "No phone number"
                          }
                          disabled={!candidate.phone}
                          onClick={() => onChatSelect(candidate)}
                          color="emerald"
                          active={isChat}
                        >
                          <MessageCircle className="size-3" />
                        </ActionIconButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {isFetching && !isLoading ? (
        <p className="mt-2 text-right text-xs text-slate-400">Refreshing…</p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importMutation.mutate(file);
        }}
      />

      <SendStage1Dialog
        campaign={campaign}
        candidate={sendTarget}
        onOpenChange={(open) => {
          if (!open) setSendTarget(null);
        }}
      />

      <SendBulkDialog
        campaignId={campaignId}
        open={bulkSendOpen}
        onOpenChange={setBulkSendOpen}
        candidates={selectedCandidates}
        onSent={clearSelection}
      />

      <SendWhatsAppDialog
        campaignId={campaignId}
        campaign={campaign}
        open={waBulkSendOpen}
        onOpenChange={setWaBulkSendOpen}
        candidates={selectedCandidates}
        onSent={clearSelection}
      />

      <ImportFilteredDialog
        campaignId={campaignId}
        open={importFilteredOpen}
        onOpenChange={setImportFilteredOpen}
      />

      <PullResponsesDialog
        campaignId={campaignId}
        campaign={campaign}
        open={pullResponsesOpen}
        onOpenChange={setPullResponsesOpen}
      />
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-all ${
        active
          ? "border border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
          : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      {label}
      <span
        className={`rounded px-1 py-0 text-[10px] font-semibold ${
          active
            ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300"
            : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
    >
      {icon}
      {label}
    </button>
  );
}

function ActionIconButton({
  children,
  title,
  disabled,
  onClick,
  color,
  active,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  color: "blue" | "emerald";
  active?: boolean;
}) {
  const colorMap = {
    blue: active
      ? "border-blue-200 bg-blue-50 text-blue-600"
      : "border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600",
    emerald: active
      ? "border-emerald-200 bg-emerald-50 text-emerald-600"
      : "border-slate-200 text-slate-400 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600",
  };
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-6 items-center justify-center rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:text-slate-500 ${colorMap[color]}`}
    >
      {children}
    </button>
  );
}

function VerdictChip({ verdict }: { verdict: Candidate["verdict"] }) {
  if (verdict === "good_fit") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        Good Fit
      </span>
    );
  }
  if (verdict === "not_fit") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-400">
        Not Fit
      </span>
    );
  }
  return <span className="text-xs italic text-slate-300">—</span>;
}

function formatSentAt(iso: string | null): React.ReactNode {
  if (!iso) return <span className="italic text-slate-300">—</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()))
    return <span className="italic text-slate-300">—</span>;
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return (
    <span className="text-xs text-slate-500">
      {month} {day}, {hh}:{mm}
    </span>
  );
}

function describe(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error.";
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, idx) => (
        <TableRow key={idx} className="border-slate-100 dark:border-slate-800">
          {Array.from({ length: 10 }).map((__, cellIdx) => (
            <TableCell key={cellIdx} className="py-4">
              <Skeleton className="h-3.5 w-full max-w-[140px] rounded-md" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ onImport }: { onImport: () => void }) {
  return (
    <TableRow>
      <TableCell colSpan={10}>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
            <Inbox className="size-6 text-slate-400" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No candidates yet
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Import applicants from a Google Sheet exported via ApplicantSync.
            </p>
          </div>
          <Button
            onClick={onImport}
            variant="outline"
            size="sm"
            className="mt-1 h-8 text-xs"
          >
            Import candidates
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function FilterEmptyRow({ onClear }: { onClear: () => void }) {
  return (
    <TableRow>
      <TableCell colSpan={10}>
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="text-sm text-slate-400">
            No candidates match this filter.
          </p>
          <button
            onClick={onClear}
            className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
          >
            Clear filter
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ErrorRow({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const message =
    error instanceof ApiClientError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Could not load candidates.";
  return (
    <TableRow>
      <TableCell colSpan={10}>
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm font-medium text-destructive">{message}</p>
          <Button onClick={onRetry} variant="outline" size="sm">
            Retry
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
