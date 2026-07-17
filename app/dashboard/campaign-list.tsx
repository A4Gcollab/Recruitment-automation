"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FolderPlus, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

      {/* ── Mobile card list (hidden on md+) ─────────────────────────── */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : isError ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <p className="text-sm text-destructive mb-2">Could not load campaigns.</p>
            <Button onClick={() => refetch()} variant="outline" size="sm">Retry</Button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 flex flex-col items-center gap-3 text-center">
            <FolderPlus className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No campaigns yet</p>
            <Button onClick={() => setCreateOpen(true)} variant="outline" size="sm">Create campaign</Button>
          </div>
        ) : (
          campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} className="block rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm leading-tight">{c.role_name}</p>
                <Badge className={`capitalize shrink-0 text-xs ${statusClass(c.status)}`}>{c.status}</Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {(c.interview_date || c.interview_time) && (
                  <span>{c.interview_date}{c.interview_time ? ` · ${c.interview_time}` : ""}</span>
                )}
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* ── Desktop table (hidden below md) ───────────────────────────── */}
      <div className="hidden md:block overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
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
                    <Badge className={`capitalize ${statusClass(c.status)}`}>
                      {c.status}
                    </Badge>
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
