"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiClientError,
  fetchCampaign,
  patchCampaign,
  type CampaignDetail,
} from "@/lib/api/candidates";
import { CandidatesTable } from "./candidates-table";
import { ImportDialog } from "./import-dialog";

export function campaignQueryKey(id: string) {
  return ["campaign", id] as const;
}

export function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const [importOpen, setImportOpen] = useState(false);
  const [editingJobUrl, setEditingJobUrl] = useState(false);
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
    <>
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link href="/dashboard">
            <ArrowLeft />
            Back to campaigns
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {isLoading ? (
              <>
                <Skeleton className="mb-2 h-7 w-56" />
                <Skeleton className="h-4 w-40" />
              </>
            ) : isError ? (
              <CampaignError error={error} onRetry={() => refetch()} />
            ) : data ? (
              <CampaignHeader
                campaign={data}
                editingJobUrl={editingJobUrl}
                onEditJobUrl={() => setEditingJobUrl(true)}
                onSaveJobUrl={(url) => jobUrlMutation.mutate(url)}
                onCancelJobUrl={() => setEditingJobUrl(false)}
                savingJobUrl={jobUrlMutation.isPending}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setImportOpen(true)} disabled={!data}>
              <Upload />
              Import candidates
            </Button>
            <Button
              variant="destructive"
              size="icon"
              disabled={!data || deleteMutation.isPending}
              title="Delete campaign"
              onClick={() => {
                if (confirm(`Delete "${data?.role_name}"? This removes all candidates, emails, and WhatsApp data. This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <CandidatesTable
        campaignId={campaignId}
        campaign={data}
        onImport={() => setImportOpen(true)}
      />

      <ImportDialog
        campaignId={campaignId}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </>
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
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {campaign.role_name}
      </h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge className={`capitalize ${statusClass(campaign.status)}`}>
          {campaign.status}
        </Badge>
        <span>
          {total} candidate{total === 1 ? "" : "s"}
          {campaign.interview_date
            ? ` · Interview ${campaign.interview_date}`
            : ""}
        </span>
      </div>
      <div className="mt-2">
        {editingJobUrl ? (
          <div className="flex items-center gap-2">
            <Input
              type="url"
              value={jobUrlInput}
              onChange={(e) => setJobUrlInput(e.target.value)}
              placeholder="https://linkedin.com/jobs/…"
              className="h-7 w-72 text-xs"
              disabled={savingJobUrl}
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={savingJobUrl}
              onClick={() => onSaveJobUrl(jobUrlInput.trim() || null)}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={savingJobUrl}
              onClick={onCancelJobUrl}
            >
              Cancel
            </Button>
          </div>
        ) : campaign.job_post_url ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Job post:</span>
            <a
              href={campaign.job_post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 underline hover:text-foreground"
            >
              {new URL(campaign.job_post_url).hostname}
              <ExternalLink className="size-3" />
            </a>
            <button
              onClick={onEditJobUrl}
              className="ml-1 text-muted-foreground hover:text-foreground"
              title="Edit job post URL"
            >
              <Pencil className="size-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={onEditJobUrl}
            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >
            <Pencil className="size-3" />
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
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "paused":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "closed":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
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
      <p className="text-base font-medium text-destructive">{message}</p>
      <Button onClick={onRetry} variant="outline" size="sm" className="self-start">
        Retry
      </Button>
    </div>
  );
}
