"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FolderPlus, ArrowRight } from "lucide-react";

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
import { ApiClientError, fetchCampaigns } from "@/lib/api/candidates";
import { CreateCampaignDialog } from "./create-campaign-dialog";

export const campaignsQueryKey = ["campaigns"] as const;

export function CampaignList() {
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: campaignsQueryKey,
    queryFn: fetchCampaigns,
  });

  const campaigns = data?.items ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`
              : "Loading campaigns…"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <FolderPlus />
          Create campaign
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Interview</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingRows />
            ) : isError ? (
              <ErrorRow error={error} onRetry={() => refetch()} />
            ) : campaigns.length === 0 ? (
              <EmptyRow onCreate={() => setCreateOpen(true)} />
            ) : (
              campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.role_name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.interview_date && c.interview_time
                      ? `${c.interview_date} · ${c.interview_time}`
                      : c.interview_date || c.interview_time || (
                          <span className="italic">—</span>
                        )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/campaigns/${c.id}`}>
                        Open
                        <ArrowRight />
                      </Link>
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

      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, idx) => (
        <TableRow key={idx}>
          {Array.from({ length: 5 }).map((__, cellIdx) => (
            <TableCell key={cellIdx}>
              <Skeleton className="h-4 w-full max-w-[160px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ onCreate }: { onCreate: () => void }) {
  return (
    <TableRow>
      <TableCell colSpan={5}>
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <FolderPlus className="size-10 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-base font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first campaign to start importing candidates.
            </p>
          </div>
          <Button onClick={onCreate} variant="outline">
            Create campaign
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
        : "Could not load campaigns.";

  return (
    <TableRow>
      <TableCell colSpan={5}>
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
