"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  ApiClientError,
  pullResponses,
  type CampaignDetail,
  type PullResponsesPayload,
  type PullResponsesResult,
} from "@/lib/api/candidates";
import { campaignQueryKey } from "./campaign-detail-view";
import { candidatesQueryKey } from "./candidates-table";

const UNMATCHED_PREVIEW = 6;

export function PullResponsesDialog({
  campaignId,
  campaign,
  open,
  onOpenChange,
}: {
  campaignId: string;
  campaign: CampaignDetail | undefined;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const storedUrl = campaign?.form_response_sheet_url ?? "";
  const [overrideUrl, setOverrideUrl] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const payload: PullResponsesPayload = {};
      const useUrl = overrideUrl.trim();
      if (useUrl) payload.response_sheet_url = useUrl;
      return pullResponses(campaignId, payload);
    },
    onSuccess: (result: PullResponsesResult) => {
      toast.success("Form responses pulled", {
        description: `${result.matched} new response${
          result.matched === 1 ? "" : "s"
        } imported · ${result.deduped} already on file · ${result.unmatched.length} unmatched.`,
      });
      queryClient.invalidateQueries({
        queryKey: candidatesQueryKey(campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: campaignQueryKey(campaignId),
      });
      if (result.unmatched.length > 0) {
        const preview = result.unmatched
          .slice(0, UNMATCHED_PREVIEW)
          .map((u) => u.email ?? `row ${u.row} (no email)`)
          .join(", ");
        const more =
          result.unmatched.length > UNMATCHED_PREVIEW
            ? ` + ${result.unmatched.length - UNMATCHED_PREVIEW} more`
            : "";
        toast.warning(
          `${result.unmatched.length} response${
            result.unmatched.length === 1 ? "" : "s"
          } couldn't be matched to a candidate`,
          { description: preview + more, duration: 12000 },
        );
      }
      setOverrideUrl("");
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiClientError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Unknown error";
      toast.error("Pull responses failed", { description: message });
    },
  });

  const hasUrl = !!storedUrl.trim() || !!overrideUrl.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (!next) setOverrideUrl("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pull Google Form responses</DialogTitle>
          <DialogDescription>
            Reads the Form&apos;s linked response sheet, matches each submission
            to a candidate by email, and writes the answers into the dashboard.
            Already-imported submissions are skipped (deduplicated by candidate
            + submission timestamp).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {storedUrl ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="mb-1 font-medium text-foreground">
                Will read from this sheet (set on the campaign):
              </div>
              <div className="break-all font-mono text-xs text-muted-foreground">
                {storedUrl}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-200">
              No response sheet URL saved on this campaign. Paste one below to
              continue.
            </div>
          )}

          <div>
            <label
              htmlFor="override-url"
              className="text-xs font-medium text-foreground"
            >
              {storedUrl
                ? "Override sheet URL (optional)"
                : "Form response sheet URL"}
            </label>
            <Input
              id="override-url"
              type="url"
              value={overrideUrl}
              onChange={(e) => setOverrideUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The sheet must be shared with the service account (or set to
              &quot;Anyone with the link → Viewer&quot;), and have a column
              named &quot;Email Address&quot; (or similar).
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => {
              setOverrideUrl("");
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!hasUrl || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Pulling…
              </>
            ) : (
              <>
                <Download />
                Pull responses
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
