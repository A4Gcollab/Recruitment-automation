"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiClientError,
  fetchCampaign,
  type CampaignDetail,
} from "@/lib/api/candidates";
import { CandidatesTable } from "./candidates-table";
import { ImportDialog } from "./import-dialog";

export function campaignQueryKey(id: string) {
  return ["campaign", id] as const;
}

export function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: campaignQueryKey(campaignId),
    queryFn: () => fetchCampaign(campaignId),
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
              <CampaignHeader campaign={data} />
            ) : null}
          </div>
          <Button onClick={() => setImportOpen(true)} disabled={!data}>
            <Upload />
            Import candidates
          </Button>
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

function CampaignHeader({ campaign }: { campaign: CampaignDetail }) {
  const total = campaign.counts_by_stage.reduce((acc, s) => acc + s.count, 0);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {campaign.role_name}
      </h1>
      <p className="text-sm text-muted-foreground">
        <span className="capitalize">{campaign.status}</span> · {total}{" "}
        candidate{total === 1 ? "" : "s"}
        {campaign.interview_date ? ` · Interview ${campaign.interview_date}` : ""}
      </p>
    </div>
  );
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
