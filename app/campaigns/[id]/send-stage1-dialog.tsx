"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
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
  sendEmail,
  type CampaignDetail,
  type SendEmailPayload,
} from "@/lib/api/candidates";
import type { Candidate } from "@/lib/types";
import { candidatesQueryKey } from "./candidates-table";

export function SendStage1Dialog({
  candidate,
  campaign,
  onOpenChange,
}: {
  candidate: Candidate | null;
  campaign: CampaignDetail | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const open = !!candidate;

  const mutation = useMutation({
    mutationFn: (payload: SendEmailPayload) => sendEmail(payload),
    onSuccess: (result) => {
      toast.success("Stage-1 email queued", {
        description: `Dispatcher will send it within the 9am–6pm IST window. Idempotency key: ${result.idempotency_key}`,
      });
      if (candidate) {
        queryClient.invalidateQueries({
          queryKey: candidatesQueryKey(candidate.campaign_id),
        });
      }
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiClientError ? messageFor(err) : describe(err);
      toast.error("Could not queue email", { description: message });
    },
  });

  if (!candidate) return null;

  const firstName = candidate.full_name.split(/\s+/)[0] ?? candidate.full_name;
  const roleName = campaign?.role_name ?? "—";
  const formLink = campaign?.google_form_url ?? "";
  const subject = `Next Step — Stage-1 Screening Form | ${roleName} | Omysha Foundation`;

  const canSend = !!candidate.email && !mutation.isPending;
  const missingFormLink = !formLink.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && mutation.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Stage-1 screening form</DialogTitle>
          <DialogDescription>
            Email is queued and dispatched within the 9am–6pm IST sending
            window with a 30–60s gap between sends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <Row label="To">
            <span className="font-medium text-foreground">
              {candidate.full_name}
            </span>{" "}
            {candidate.email ? (
              <span className="text-muted-foreground">
                &lt;{candidate.email}&gt;
              </span>
            ) : (
              <span className="italic text-destructive">no email on file</span>
            )}
          </Row>
          <Row label="Role">{roleName}</Row>
          <Row label="Subject">
            <span className="break-words">{subject}</span>
          </Row>
          <Row label="Form link">
            {formLink ? (
              <a
                href={formLink}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-xs underline-offset-4 hover:underline"
              >
                {formLink}
              </a>
            ) : (
              <span className="italic text-destructive">
                not set on campaign — update the campaign before sending
              </span>
            )}
          </Row>
          <Row label="Greeting">Dear {firstName}, …</Row>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSend || missingFormLink}
            onClick={() =>
              mutation.mutate({
                candidate_id: candidate.id,
                template_type: "stage1",
              })
            }
          >
            {mutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Mail />
            )}
            {mutation.isPending ? "Queuing…" : "Queue email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}

function messageFor(err: ApiClientError): string {
  switch (err.code) {
    case "kill_switch_active":
      return "KILL_SWITCH_EMAIL is set — all sends are halted.";
    case "already_sent":
      return "This template has already been queued for this candidate today.";
    case "candidate_not_found":
      return "Candidate no longer exists.";
    case "campaign_not_found":
      return "Campaign no longer exists.";
    case "validation_error":
      return err.message;
    default:
      return err.message;
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error.";
}
