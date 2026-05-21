"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiClientError,
  sendBulk,
  type BulkSendResult,
  type Candidate,
  type SendBulkPayload,
} from "@/lib/api/candidates";
import { campaignQueryKey } from "./campaign-detail-view";
import { candidatesQueryKey } from "./candidates-table";

const PREVIEW_COUNT = 5;

export function SendBulkDialog({
  campaignId,
  candidates,
  open,
  onOpenChange,
  onSent,
}: {
  campaignId: string;
  candidates: Candidate[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSent?: () => void;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: SendBulkPayload) => sendBulk(campaignId, payload),
    onSuccess: (result: BulkSendResult) => {
      const skippedCount = result.skipped.length;
      toast.success("Bulk Stage-1 send queued", {
        description:
          skippedCount === 0
            ? `${result.queued} email${result.queued === 1 ? "" : "s"} queued. They'll send within the configured IST sending window.`
            : `${result.queued} queued · ${skippedCount} skipped (${skipSummary(result.skipped)}).`,
      });
      queryClient.invalidateQueries({
        queryKey: candidatesQueryKey(campaignId),
      });
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaignId) });
      onSent?.();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error("Bulk send failed", { description: describe(err) });
    },
  });

  const count = candidates.length;
  const preview = candidates.slice(0, PREVIEW_COUNT);
  const remaining = Math.max(0, count - PREVIEW_COUNT);
  const pending = mutation.isPending;
  const canSend = count > 0 && !pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Stage-1 Google Form to {count}</DialogTitle>
          <DialogDescription>
            Queues one email per selected candidate through the rate-limited
            queue (configured cap + gaps, IST sending window). Each candidate
            advances to <code>stage1_sent</code> only when the cron actually
            sends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Recipients
            </p>
            <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
              {preview.map((c) => (
                <li
                  key={c.id}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="font-medium text-foreground">
                    {c.full_name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.email ?? "—"}
                  </span>
                </li>
              ))}
              {remaining > 0 ? (
                <li className="pt-1 text-xs italic text-muted-foreground">
                  +{remaining} more…
                </li>
              ) : null}
              {count === 0 ? (
                <li className="text-xs italic text-muted-foreground">
                  No candidates selected.
                </li>
              ) : null}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Backend skips rows that fail preconditions (not Good Fit, no email
            on file, already queued). You&apos;ll see the skip count in the toast.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSend}
            onClick={() =>
              mutation.mutate({
                template_type: "stage1",
                candidate_ids: candidates.map((c) => c.id),
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            {pending ? "Queuing…" : `Queue ${count} email${count === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function skipSummary(skipped: BulkSendResult["skipped"]): string {
  const counts = new Map<string, number>();
  for (const s of skipped) {
    counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, n]) => `${n} ${reason}`)
    .join(", ");
}

function describe(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === "kill_switch_active")
      return "KILL_SWITCH_EMAIL is set — all sends are halted.";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error.";
}
