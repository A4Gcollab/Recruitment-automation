"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ExternalLink,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiClientError,
  fetchCampaign,
  patchCampaign,
  type Candidate,
  type CampaignDetail,
} from "@/lib/api/candidates";
import { CandidatesTable } from "./candidates-table";
import { ImportDialog } from "./import-dialog";
import { WhatsAppWorkspace } from "./whatsapp-workspace";

export function campaignQueryKey(id: string) {
  return ["campaign", id] as const;
}

export function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const [importOpen, setImportOpen] = useState(false);
  const [editingJobUrl, setEditingJobUrl] = useState(false);
  const [chatTarget, setChatTarget] = useState<Candidate | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: campaignQueryKey(campaignId),
    queryFn: () => fetchCampaign(campaignId),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Failed to delete campaign");
        return r.json();
      }),
    onSuccess: () => {
      toast.success("Campaign deleted", {
        description: "All candidates and related data have been removed.",
      });
      router.push("/dashboard");
    },
    onError: () => toast.error("Failed to delete campaign"),
  });

  const jobUrlMutation = useMutation({
    mutationFn: (url: string | null) =>
      patchCampaign(campaignId, { job_post_url: url }),
    onSuccess: () => {
      toast.success("Job post URL saved");
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaignId) });
      setEditingJobUrl(false);
    },
    onError: () => toast.error("Failed to save job post URL"),
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: main workspace ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar: breadcrumb + search */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-6 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/dashboard"
              className="text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-300"
            >
              Campaigns
            </Link>
            <ChevronRight className="size-3.5 text-slate-300 dark:text-slate-600" />
            {isLoading ? (
              <Skeleton className="h-4 w-44" />
            ) : (
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {data?.role_name ?? "Campaign"}
              </span>
            )}
          </nav>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search candidates..."
              className="h-7 w-48 rounded-lg border border-slate-200 bg-slate-50 pl-7 pr-8 text-[11.5px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-400 dark:bg-slate-700">
              ⌘K
            </span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Campaign header */}
          <div className="border-b border-slate-200/80 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : isError ? (
              <CampaignError error={error} onRetry={() => refetch()} />
            ) : data ? (
              <div className="flex items-start justify-between gap-4">
                <CampaignHeader
                  campaign={data}
                  editingJobUrl={editingJobUrl}
                  onEditJobUrl={() => setEditingJobUrl(true)}
                  onSaveJobUrl={(url) => jobUrlMutation.mutate(url)}
                  onCancelJobUrl={() => setEditingJobUrl(false)}
                  savingJobUrl={jobUrlMutation.isPending}
                />
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    onClick={() => setImportOpen(true)}
                    disabled={!data}
                    className="h-8 bg-blue-600 text-xs text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                    size="sm"
                  >
                    <Upload className="size-3.5" />
                    Import candidates
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 border-rose-200 text-rose-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-rose-900 dark:text-rose-500 dark:hover:bg-rose-950"
                    disabled={!data || deleteMutation.isPending}
                    title="Delete campaign"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${data?.role_name}"? This removes all candidates, emails, and WhatsApp data. This cannot be undone.`
                        )
                      ) {
                        deleteMutation.mutate();
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Candidates table */}
          <div className="p-6">
            <CandidatesTable
              campaignId={campaignId}
              campaign={data}
              onImport={() => setImportOpen(true)}
              chatTarget={chatTarget}
              onChatSelect={setChatTarget}
            />
          </div>
        </div>
      </div>

      {/* ── Right: WhatsApp workspace (always visible) ── */}
      <div className="relative w-[400px] shrink-0 border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <WhatsAppWorkspace
          candidate={chatTarget}
          onClose={() => setChatTarget(null)}
        />
      </div>

      <ImportDialog
        campaignId={campaignId}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  );
}

function CampaignHeader({
  campaign,
  editingJobUrl,
  onEditJobUrl,
  onSaveJobUrl,
  onCancelJobUrl,
  savingJobUrl,
}: {
  campaign: CampaignDetail;
  editingJobUrl: boolean;
  onEditJobUrl: () => void;
  onSaveJobUrl: (url: string | null) => void;
  onCancelJobUrl: () => void;
  savingJobUrl: boolean;
}) {
  const [jobUrlInput, setJobUrlInput] = useState(campaign.job_post_url ?? "");
  const total = campaign.counts_by_stage.reduce((acc, s) => acc + s.count, 0);

  return (
    <div className="min-w-0">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {campaign.role_name}
      </h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Badge
          className={`h-5 rounded-full px-2 text-[10px] font-medium capitalize ${statusClass(campaign.status)}`}
        >
          {campaign.status}
        </Badge>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {total} candidate{total === 1 ? "" : "s"}
          {campaign.interview_date
            ? ` · Interview ${campaign.interview_date}`
            : ""}
        </span>
      </div>
      <div className="mt-1.5">
        {editingJobUrl ? (
          <div className="flex items-center gap-2">
            <Input
              type="url"
              value={jobUrlInput}
              onChange={(e) => setJobUrlInput(e.target.value)}
              placeholder="https://linkedin.com/jobs/…"
              className="h-6 w-64 text-[11px]"
              disabled={savingJobUrl}
              autoFocus
            />
            <Button
              size="sm"
              className="h-6 text-[11px]"
              disabled={savingJobUrl}
              onClick={() => onSaveJobUrl(jobUrlInput.trim() || null)}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px]"
              disabled={savingJobUrl}
              onClick={onCancelJobUrl}
            >
              Cancel
            </Button>
          </div>
        ) : campaign.job_post_url ? (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>Job post:</span>
            <a
              href={campaign.job_post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700 hover:underline"
            >
              {new URL(campaign.job_post_url).hostname}
              <ExternalLink className="size-2.5" />
            </a>
            <button
              onClick={onEditJobUrl}
              className="text-slate-300 hover:text-slate-600 dark:hover:text-slate-300"
              title="Edit job post URL"
            >
              <Pencil className="size-2.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onEditJobUrl}
            className="flex items-center gap-1 text-[11px] text-amber-500 hover:text-amber-600"
          >
            <Pencil className="size-2.5" />
            Set job post URL (needed for WhatsApp template)
          </button>
        )}
      </div>
    </div>
  );
}

function statusClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400";
    case "paused":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
    case "closed":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

function CampaignError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const message =
    error instanceof ApiClientError && error.status === 404
      ? "Campaign not found."
      : error instanceof ApiClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load campaign.";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-destructive">{message}</p>
      <Button
        onClick={onRetry}
        variant="outline"
        size="sm"
        className="self-start"
      >
        Retry
      </Button>
    </div>
  );
}
