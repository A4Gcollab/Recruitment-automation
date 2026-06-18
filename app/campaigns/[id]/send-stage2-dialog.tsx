"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Mail, MessageCircle } from "lucide-react";
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
  sendWhatsAppBulk,
  type CampaignDetail,
  type Candidate,
} from "@/lib/api/candidates";
import { campaignQueryKey } from "./campaign-detail-view";
import { candidatesQueryKey } from "./candidates-table";

const PREVIEW_COUNT = 5;

export function SendStage2Dialog({
  campaignId,
  campaign,
  candidates,
  open,
  onOpenChange,
}: {
  campaignId: string;
  campaign: CampaignDetail | undefined;
  candidates: Candidate[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const waMutation = useMutation({
    mutationFn: () =>
      sendWhatsAppBulk(campaignId, {
        template_name: "a4g_interview_invite_v1",
        candidate_ids: candidates.map((c) => c.id),
      }),
    onSuccess: (result) => {
      toast.success("Stage 2 WhatsApp queued", {
        description: `${result.queued} queued · ${result.skipped.length} skipped`,
      });
      queryClient.invalidateQueries({ queryKey: candidatesQueryKey(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaignId) });
      onOpenChange(false);
    },
    onError: (err) => toast.error("WA send failed", { description: describe(err) }),
  });

  const emailMutation = useMutation({
    mutationFn: () =>
      sendBulk(campaignId, {
        template_type: "interview_link",
        candidate_ids: candidates.map((c) => c.id),
      }),
    onSuccess: (result) => {
      toast.success("Stage 2 emails queued", {
        description: `${result.queued} queued · ${result.skipped.length} skipped`,
      });
      queryClient.invalidateQueries({ queryKey: candidatesQueryKey(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaignId) });
      onOpenChange(false);
    },
    onError: (err) => toast.error("Email send failed", { description: describe(err) }),
  });

  const isPending = waMutation.isPending || emailMutation.isPending;
  const count = candidates.length;
  const withPhone = candidates.filter((c) => c.phone).length;
  const withEmail = candidates.filter((c) => c.email).length;
  const preview = candidates.slice(0, PREVIEW_COUNT);
  const remaining = Math.max(0, count - PREVIEW_COUNT);

  // Check if required interview details are filled
  const missingFields: string[] = [];
  if (!campaign?.interview_date) missingFields.push("Interview date");
  if (!campaign?.interview_time) missingFields.push("Interview time");
  if (!campaign?.zoom_link) missingFields.push("Zoom link");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Stage 2 — Interview Invitation</DialogTitle>
          <DialogDescription>
            Send the interview invitation to {count} shortlisted candidate
            {count === 1 ? "" : "s"} via WhatsApp or email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Interview details preview */}
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Interview details (from campaign settings)
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-slate-500">Date</span>
              <span className={campaign?.interview_date ? "text-slate-800 dark:text-slate-200" : "text-amber-500"}>
                {campaign?.interview_date ?? "Not set"}
              </span>
              <span className="text-slate-500">Time</span>
              <span className={campaign?.interview_time ? "text-slate-800 dark:text-slate-200" : "text-amber-500"}>
                {campaign?.interview_time ?? "Not set"}
              </span>
              <span className="text-slate-500">Mode</span>
              <span className="text-slate-800 dark:text-slate-200">
                {campaign?.interview_mode ?? "Zoom"}
              </span>
              <span className="text-slate-500">Zoom link</span>
              <span className={campaign?.zoom_link ? "truncate text-blue-600" : "text-amber-500"}>
                {campaign?.zoom_link ?? "Not set"}
              </span>
              <span className="text-slate-500">Meeting ID</span>
              <span className="text-slate-800 dark:text-slate-200">
                {campaign?.zoom_meeting_id ?? "—"}
              </span>
              <span className="text-slate-500">Passcode</span>
              <span className="text-slate-800 dark:text-slate-200">
                {campaign?.zoom_passcode ?? "—"}
              </span>
            </div>
          </div>

          {missingFields.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong>Missing fields:</strong> {missingFields.join(", ")}. Update them via the
                campaign settings (gear icon) before sending.
              </span>
            </div>
          )}

          {/* Recipients */}
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Recipients
            </p>
            <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
              {preview.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">{c.full_name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.email ?? "no email"}
                  </span>
                </li>
              ))}
              {remaining > 0 && (
                <li className="pt-1 text-xs italic text-muted-foreground">
                  +{remaining} more…
                </li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={count === 0 || isPending}
            onClick={() => emailMutation.mutate()}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {emailMutation.isPending ? <Loader2 className="animate-spin" /> : <Mail />}
            {emailMutation.isPending ? "Sending…" : `Send Email (${withEmail})`}
          </Button>
          <Button
            type="button"
            disabled={count === 0 || isPending}
            onClick={() => waMutation.mutate()}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {waMutation.isPending ? <Loader2 className="animate-spin" /> : <MessageCircle />}
            {waMutation.isPending ? "Sending…" : `Send WhatsApp (${withPhone})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describe(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
