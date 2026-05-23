"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileUp,
  Inbox,
  Loader2,
  Mail,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import { SendBulkDialog } from "./send-bulk-dialog";
import { SendStage1Dialog } from "./send-stage1-dialog";

export function candidatesQueryKey(campaignId: string) {
  return ["candidates", { campaign_id: campaignId }] as const;
}

export function CandidatesTable({
  campaignId,
  campaign,
  onImport,
}: {
  campaignId: string;
  campaign: CampaignDetail | undefined;
  onImport: () => void;
}) {
  const queryClient = useQueryClient();
  const [sendTarget, setSendTarget] = useState<Candidate | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [importFilteredOpen, setImportFilteredOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: candidatesQueryKey(campaignId),
    queryFn: () =>
      fetchCandidates({ campaign_id: campaignId, page: 1, page_size: 200 }),
  });

  const candidates = useMemo<Candidate[]>(() => data?.items ?? [], [data]);

  // Selection helpers
  const selectedCount = selected.size;
  const allSelected =
    candidates.length > 0 && candidates.every((c) => selected.has(c.id));
  const headerCheckState: boolean | "indeterminate" =
    selectedCount === 0
      ? false
      : allSelected
        ? true
        : "indeterminate";

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

  // Bulk send eligibility — just needs ≥1 selected. Backend skips candidates
  // without email (reports `no_email` in the per-row skip list) so we don't
  // need to gate at the UI layer. Good-fit pre-filtering happens BEFORE import
  // per v2.2; everyone in this campaign is already an approved good-fit.
  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.id)),
    [candidates, selected],
  );
  const selectedWithoutEmail = selectedCandidates.filter((c) => !c.email).length;

  // ── Import evaluations (multipart upload) ───────────────────────────────
  const importMutation = useMutation({
    mutationFn: (file: File) => importEvaluations(campaignId, file, "screen1"),
    onSuccess: (result: EvaluationImportResult) => {
      const unmatched = result.unmatched.length;
      toast.success("Evaluations imported", {
        description: `${result.updated} candidate${result.updated === 1 ? "" : "s"} updated · ${result.matched} matched${unmatched ? ` · ${unmatched} unmatched` : ""}.`,
      });
      queryClient.invalidateQueries({
        queryKey: candidatesQueryKey(campaignId),
      });
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaignId) });
    },
    onError: (err: unknown) => {
      toast.error("Import failed", { description: describe(err) });
    },
    onSettled: () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  function onImportClick() {
    fileInputRef.current?.click();
  }

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    importMutation.mutate(file);
  }

  // ── Export for ChatGPT (direct browser download) ────────────────────────
  function onExportClick() {
    // Anchor with download attribute → server-issued Content-Disposition
    // filename wins, but we set a fallback so the link works even if the
    // server omits the header (e.g. during dev/error states).
    const a = document.createElement("a");
    a.href = exportCandidatesUrl(campaignId);
    a.rel = "noreferrer";
    a.download = ""; // empty = use server-provided filename
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const totalCount = candidates.length;
  const hasSelection = selectedCount > 0;

  return (
    <>
      {/* Bulk action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {totalCount} candidate{totalCount === 1 ? "" : "s"}
            {hasSelection ? ` · ${selectedCount} selected` : ""}
          </span>
          {hasSelection ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelection}
            >
              Clear selection
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportFilteredOpen(true)}
            title="Upload LinkedIn good-fit list + ApplicantSync export. Imports only matching candidates with full data."
          >
            <Users />
            Import filtered (2 files)
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExportClick}
            disabled={totalCount === 0}
            title={
              totalCount === 0
                ? "Import candidates before exporting"
                : "Download an XLSX of candidates for ChatGPT evaluation"
            }
          >
            <Download />
            Export for ChatGPT (XLSX)
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onImportClick}
            disabled={importMutation.isPending}
            title="Upload the XLSX ChatGPT filled in with verdict + reason"
          >
            {importMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FileUp />
            )}
            {importMutation.isPending
              ? "Importing…"
              : "Import evaluations (XLSX)"}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setBulkSendOpen(true)}
            disabled={!hasSelection}
            title={bulkSendTooltip({
              hasSelection,
              selectedCount,
              selectedWithoutEmail,
            })}
          >
            <Send />
            Send Google Form to selected
            {hasSelection ? ` (${selectedCount})` : ""}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onFilePicked}
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  aria-label="Select all candidates"
                  checked={headerCheckState}
                  onCheckedChange={toggleAll}
                  disabled={candidates.length === 0}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingRows />
            ) : isError ? (
              <ErrorRow error={error} onRetry={() => refetch()} />
            ) : candidates.length === 0 ? (
              <EmptyRow onImport={onImport} />
            ) : (
              candidates.map((candidate) => (
                <TableRow
                  key={candidate.id}
                  data-state={selected.has(candidate.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${candidate.full_name}`}
                      checked={selected.has(candidate.id)}
                      onCheckedChange={(next) =>
                        toggleOne(candidate.id, next)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {candidate.full_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {candidate.email ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {candidate.linkedin_url ? (
                      <a
                        href={candidate.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-4 hover:underline"
                      >
                        Profile
                      </a>
                    ) : (
                      <span className="italic">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {candidate.stage}
                    </span>
                  </TableCell>
                  <TableCell>
                    <VerdictChip verdict={candidate.verdict} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatSentAt(candidate.stage1_sent_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!candidate.email}
                      title={
                        candidate.email
                          ? "Send the Stage-1 screening form"
                          : "Candidate has no email on file"
                      }
                      onClick={() => setSendTarget(candidate)}
                    >
                      <Mail />
                      Send Stage-1
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {isFetching && !isLoading ? (
        <p className="text-xs text-muted-foreground">Refreshing…</p>
      ) : null}

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

      <ImportFilteredDialog
        campaignId={campaignId}
        open={importFilteredOpen}
        onOpenChange={setImportFilteredOpen}
      />
    </>
  );
}

function bulkSendTooltip({
  hasSelection,
  selectedCount,
  selectedWithoutEmail,
}: {
  hasSelection: boolean;
  selectedCount: number;
  selectedWithoutEmail: number;
}): string {
  if (!hasSelection) return "Select one or more candidates first.";
  const sendable = selectedCount - selectedWithoutEmail;
  if (selectedWithoutEmail > 0) {
    return `${sendable} will be queued. ${selectedWithoutEmail} will be skipped (no email on file).`;
  }
  return `Queue Stage-1 emails for ${selectedCount} candidate${selectedCount === 1 ? "" : "s"}.`;
}

function VerdictChip({ verdict }: { verdict: Candidate["verdict"] }) {
  if (verdict === "good_fit") {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        Good Fit
      </span>
    );
  }
  if (verdict === "not_fit") {
    return (
      <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
        Not Fit
      </span>
    );
  }
  return <span className="text-xs italic text-muted-foreground">—</span>;
}

function formatSentAt(iso: string | null): React.ReactNode {
  if (!iso) return <span className="italic">—</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className="italic">—</span>;
  // "May 21, 14:32" — locale-stable short format
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hh}:${mm}`;
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
        <TableRow key={idx}>
          {Array.from({ length: 8 }).map((__, cellIdx) => (
            <TableCell key={cellIdx}>
              <Skeleton className="h-4 w-full max-w-[160px]" />
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
      <TableCell colSpan={8}>
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Inbox className="size-10 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-base font-medium">No candidates yet</p>
            <p className="text-sm text-muted-foreground">
              Import applicants from a Google Sheet exported via
              ApplicantSync.
            </p>
          </div>
          <Button onClick={onImport} variant="outline">
            Import candidates
          </Button>
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
      <TableCell colSpan={8}>
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-base font-medium text-destructive">{message}</p>
          <Button onClick={onRetry} variant="outline" size="sm">
            Retry
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
