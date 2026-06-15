"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
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
  sendWhatsAppBulk,
  type Candidate,
  type WhatsAppBulkSendResult,
} from "@/lib/api/candidates";
import { campaignQueryKey } from "./campaign-detail-view";
import { candidatesQueryKey } from "./candidates-table";

const PREVIEW_COUNT = 5;

export function SendWhatsAppDialog({
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
    mutationFn: () =>
      sendWhatsAppBulk(campaignId, {
        template_name: "recruitment_stage1",
        candidate_ids: candidates.map((c) => c.id),
      }),
    onSuccess: (result: WhatsAppBulkSendResult) => {
      const skippedCount = result.skipped.length;
      toast.success("WhatsApp messages queued", {
        description:
          skippedCount === 0
            ? `${result.queued} message${result.queued === 1 ? "" : "s"} queued for sending.`
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
      toast.error("WhatsApp send failed", { description: describe(err) });
    },
  });

  const count = candidates.length;
  const withPhone = candidates.filter((c) => c.phone).length;
  const withoutPhone = count - withPhone;
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
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-5 text-emerald-600" />
            Send WhatsApp to {count}
          </DialogTitle>
          <DialogDescription>
            Queues one WhatsApp template message per selected candidate through
            the rate-limited queue. Candidates without a phone number will be
            skipped.
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
                    {c.phone ?? "no phone"}
                  </span>
                </li>
              ))}
              {remaining > 0 ? (
                <li className="pt-1 text-xs italic text-muted-foreground">
                  +{remaining} more...
                </li>
              ) : null}
            </ul>
          </div>

          {withoutPhone > 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {withoutPhone} candidate{withoutPhone === 1 ? "" : "s"} will be
              skipped (no phone number on file).
            </p>
          ) : null}
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
            onClick={() => mutation.mutate()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <MessageCircle />
            )}
            {pending
              ? "Queuing..."
              : `Queue ${withPhone} WhatsApp${withPhone === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function skipSummary(
  skipped: WhatsAppBulkSendResult["skipped"],
): string {
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
      return "KILL_SWITCH_WHATSAPP is set — all sends are halted.";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error.";
}
