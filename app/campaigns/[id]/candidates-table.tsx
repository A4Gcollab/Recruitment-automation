"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  fetchCandidates,
  type CampaignDetail,
} from "@/lib/api/candidates";
import type { Candidate } from "@/lib/types";
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
  const [sendTarget, setSendTarget] = useState<Candidate | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: candidatesQueryKey(campaignId),
    queryFn: () =>
      fetchCandidates({ campaign_id: campaignId, page: 1, page_size: 200 }),
  });

  const candidates = useMemo(() => data?.items ?? [], [data]);

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead>Headline</TableHead>
              <TableHead>Stage</TableHead>
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
                <TableRow key={candidate.id}>
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
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {candidate.headline ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {candidate.stage}
                    </span>
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
    </>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, idx) => (
        <TableRow key={idx}>
          {Array.from({ length: 6 }).map((__, cellIdx) => (
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
      <TableCell colSpan={6}>
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
      <TableCell colSpan={6}>
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
