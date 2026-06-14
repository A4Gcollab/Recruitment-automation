"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { patchCampaign, type CampaignDetail } from "@/lib/api/candidates";
import { campaignQueryKey } from "./campaign-detail-view";

type FormState = {
  google_form_url: string;
  job_post_url: string;
  interview_date: string;
  interview_time: string;
  interview_mode: string;
  zoom_link: string;
  zoom_meeting_id: string;
  zoom_passcode: string;
};

function toForm(campaign: CampaignDetail): FormState {
  return {
    google_form_url: campaign.google_form_url ?? "",
    job_post_url: campaign.job_post_url ?? "",
    interview_date: campaign.interview_date ?? "",
    interview_time: campaign.interview_time ?? "",
    interview_mode: campaign.interview_mode ?? "Zoom",
    zoom_link: campaign.zoom_link ?? "",
    zoom_meeting_id: campaign.zoom_meeting_id ?? "",
    zoom_passcode: campaign.zoom_passcode ?? "",
  };
}

export function EditCampaignDialog({
  campaign,
  open,
  onOpenChange,
}: {
  campaign: CampaignDetail;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(campaign));

  // Re-sync when campaign data refreshes
  useEffect(() => {
    if (open) setForm(toForm(campaign));
  }, [campaign, open]);

  const mutation = useMutation({
    mutationFn: () =>
      patchCampaign(campaign.id, {
        google_form_url: form.google_form_url.trim() || null,
        job_post_url: form.job_post_url.trim() || null,
        interview_date: form.interview_date.trim() || null,
        interview_time: form.interview_time.trim() || null,
        interview_mode: form.interview_mode.trim() || null,
        zoom_link: form.zoom_link.trim() || null,
        zoom_meeting_id: form.zoom_meeting_id.trim() || null,
        zoom_passcode: form.zoom_passcode.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Campaign settings saved");
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaign.id) });
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to save campaign settings"),
  });

  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
      disabled: mutation.isPending,
    };
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && mutation.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit campaign settings</DialogTitle>
          <DialogDescription>
            Update interview details, links, and form URL. All fields are optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Links */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Links
            </p>
            <Field id="google_form_url" label="Google Form URL" type="url" placeholder="https://forms.gle/…" {...field("google_form_url")} />
            <Field id="job_post_url" label="Job post URL" type="url" placeholder="https://linkedin.com/jobs/…" {...field("job_post_url")} />
          </section>

          {/* Interview */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Interview
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field id="interview_date" label="Date" placeholder="Wednesday, 3 June 2026" {...field("interview_date")} />
              <Field id="interview_time" label="Time" placeholder="3:00 PM IST" {...field("interview_time")} />
            </div>
            <Field id="interview_mode" label="Mode" placeholder="Zoom" {...field("interview_mode")} />
          </section>

          {/* Zoom */}
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Zoom
            </p>
            <Field id="zoom_link" label="Join link" type="url" placeholder="https://us06web.zoom.us/j/…" {...field("zoom_link")} />
            <div className="grid grid-cols-2 gap-3">
              <Field id="zoom_meeting_id" label="Meeting ID" placeholder="825 9046 2212" {...field("zoom_meeting_id")} />
              <Field id="zoom_passcode" label="Passcode" placeholder="337954" {...field("zoom_passcode")} />
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
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
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="h-8 text-sm"
      />
    </div>
  );
}
