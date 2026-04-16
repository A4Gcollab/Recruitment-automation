"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Inbox } from "lucide-react";

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
import { ApiClientError, fetchCandidates } from "@/lib/api/candidates";
import { ImportDialog, type ImportDialogProps } from "./import-dialog";

export const candidatesQueryKey = ["candidates"] as const;

export function CandidatesTable() {
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: candidatesQueryKey,
    queryFn: () => fetchCandidates({ page: 1, page_size: 200 }),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.total} total · page ${data.page}`
              : "Loading pipeline…"}
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)}>Import candidates</Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Stage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingRows />
            ) : isError ? (
              <ErrorRow error={error} onRetry={() => refetch()} />
            ) : !data || data.items.length === 0 ? (
              <EmptyRow onImport={() => setImportOpen(true)} />
            ) : (
              data.items.map((candidate) => (
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
                  <TableCell>{candidate.role}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {candidate.stage}
                    </span>
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

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          setImportOpen(false);
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
          {Array.from({ length: 5 }).map((__, cellIdx) => (
            <TableCell key={cellIdx}>
              <Skeleton className="h-4 w-full max-w-[180px]" />
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
      <TableCell colSpan={5}>
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Inbox className="size-10 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-base font-medium">No candidates yet</p>
            <p className="text-sm text-muted-foreground">
              Import your first batch from a Google Sheet to get started.
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

export type { ImportDialogProps };
