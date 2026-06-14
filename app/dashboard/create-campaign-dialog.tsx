"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ApiClientError,
  createCampaign,
  type CreateCampaignPayload,
} from "@/lib/api/candidates";
import { campaignsQueryKey } from "./campaign-list";

// Sensible default Stage-1 template so HR can hit Save with no edits.
// Backend has its own defaults for reminder + interview bodies (CONTRACTS §5
// `lib/email/defaults.ts`); we only surface Stage-1 for today's MVP.
const DEFAULT_STAGE1_SUBJECT =
  "Next Step — Stage-1 Screening Form | {{role_name}} | Omysha Foundation-A4G & VONG";

const DEFAULT_STAGE1_BODY = `Hey {{name}},
Thank you for your interest in the {{role_name}} role at Omysha Foundation- VONG & A4G.
As the next step in our selection process, shortlisted candidates are requested to complete the Stage-1 Screening Google Form within 24 hours of receiving this message:
Google Form Link: {{form_link}}
Job Post: {{job_post_url}}
Your responses will help us understand alignment with the role. Based on the evaluation, selected candidates will be invited for an online interaction, and further details will be shared after assessment.
Please note that only candidates who submit the form within the given timeline will be considered for the interview stage.

This is the link to our A4G : https://www.a4gcollab.org/ & A4G LinkedIn page : https://www.linkedin.com/company/a4gcollab

This is the link to our VONG Movement: https://vong.earth/ & VONG LinkedIn page : https://www.linkedin.com/company/vong-earth/

Best regards,
 Team Omysha Foundation
 VONG Movement | AI for Good (A4G) Impact Collaborative`;

const DEFAULT_REMINDER_DAYS = 3;

type FormState = CreateCampaignPayload & {
  // make string-typed for the form; we strip empties at submit time
  stage1_subject: string;
  stage1_body: string;
  reminder_after_days: number;
  form_response_sheet_url: string;
  job_post_url: string;
};

const emptyForm: FormState = {
  role_name: "",
  google_form_url: "",
  zoom_link: "",
  zoom_meeting_id: "",
  zoom_passcode: "",
  interview_date: "",
  interview_time: "",
  interview_mode: "Zoom",
  job_post_url: "",
  stage1_subject: DEFAULT_STAGE1_SUBJECT,
  stage1_body: DEFAULT_STAGE1_BODY,
  reminder_after_days: DEFAULT_REMINDER_DAYS,
  form_response_sheet_url: "",
};

export function CreateCampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setForm(emptyForm);
        setTemplatesOpen(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (payload: CreateCampaignPayload) => createCampaign(payload),
    onSuccess: (campaign) => {
      toast.success("Campaign created", {
        description: `"${campaign.role_name}" is active.`,
      });
      queryClient.invalidateQueries({ queryKey: campaignsQueryKey });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create campaign.";
      toast.error("Create failed", { description: message });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: CreateCampaignPayload = {
      role_name: form.role_name.trim(),
    };

    const optionalStringKeys: (keyof FormState)[] = [
      "google_form_url",
      "zoom_link",
      "zoom_meeting_id",
      "zoom_passcode",
      "interview_date",
      "interview_time",
      "interview_mode",
      "job_post_url",
      "stage1_subject",
      "stage1_body",
      "form_response_sheet_url",
    ];
    const target = payload as unknown as Record<string, string>;
    for (const key of optionalStringKeys) {
      const val = (form[key] as string | undefined)?.trim();
      if (val) target[key] = val;
    }

    // reminder_after_days — only send if user changed it from default-empty;
    // backend has its own default of 3, but explicitly forwarding lets HR
    // override on a per-campaign basis.
    if (
      Number.isFinite(form.reminder_after_days) &&
      form.reminder_after_days > 0
    ) {
      payload.reminder_after_days = form.reminder_after_days;
    }

    mutation.mutate(payload);
  }

  const pending = mutation.isPending;
  const canSubmit = form.role_name.trim().length > 0 && !pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>
            One campaign per hiring cycle / role. Interview details and email
            templates can be edited later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            id="role_name"
            label="Role name *"
            value={form.role_name}
            onChange={(v) => setForm({ ...form, role_name: v })}
            placeholder="HR Intern"
            required
            disabled={pending}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="google_form_url"
              label="Google Form URL"
              type="url"
              value={form.google_form_url}
              onChange={(v) => setForm({ ...form, google_form_url: v })}
              placeholder="https://forms.gle/…"
              disabled={pending}
            />
            <Field
              id="job_post_url"
              label="Job post URL"
              type="url"
              value={form.job_post_url}
              onChange={(v) => setForm({ ...form, job_post_url: v })}
              placeholder="https://linkedin.com/jobs/…"
              disabled={pending}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="zoom_link"
              label="Zoom link"
              type="url"
              value={form.zoom_link}
              onChange={(v) => setForm({ ...form, zoom_link: v })}
              placeholder="https://zoom.us/j/…"
              disabled={pending}
            />
            <Field
              id="zoom_meeting_id"
              label="Zoom meeting ID"
              value={form.zoom_meeting_id}
              onChange={(v) => setForm({ ...form, zoom_meeting_id: v })}
              placeholder="123 456 7890"
              disabled={pending}
            />
            <Field
              id="zoom_passcode"
              label="Zoom passcode"
              value={form.zoom_passcode}
              onChange={(v) => setForm({ ...form, zoom_passcode: v })}
              placeholder="abc123"
              disabled={pending}
            />
            <Field
              id="interview_mode"
              label="Interview mode"
              value={form.interview_mode}
              onChange={(v) => setForm({ ...form, interview_mode: v })}
              placeholder="Zoom"
              disabled={pending}
            />
            <Field
              id="interview_date"
              label="Interview date"
              value={form.interview_date}
              onChange={(v) => setForm({ ...form, interview_date: v })}
              placeholder="Friday, 3rd May 2026"
              disabled={pending}
            />
            <Field
              id="interview_time"
              label="Interview time"
              value={form.interview_time}
              onChange={(v) => setForm({ ...form, interview_time: v })}
              placeholder="3:00 PM IST"
              disabled={pending}
            />
          </div>

          {/* Email templates + reminder cadence — collapsed by default */}
          <div className="rounded-md border bg-muted/20">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
              onClick={() => setTemplatesOpen((s) => !s)}
              aria-expanded={templatesOpen}
            >
              <span className="flex items-center gap-2">
                {templatesOpen ? (
                  <ChevronDown className="size-4" aria-hidden />
                ) : (
                  <ChevronRight className="size-4" aria-hidden />
                )}
                Email template &amp; reminders (optional)
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {templatesOpen ? "" : "Defaults will be used"}
              </span>
            </button>

            {templatesOpen ? (
              <div className="space-y-4 border-t px-3 py-4">
                <Field
                  id="stage1_subject"
                  label="Stage-1 email subject"
                  value={form.stage1_subject}
                  onChange={(v) => setForm({ ...form, stage1_subject: v })}
                  disabled={pending}
                />

                <div className="space-y-2">
                  <Label htmlFor="stage1_body">Stage-1 email body</Label>
                  <Textarea
                    id="stage1_body"
                    value={form.stage1_body}
                    onChange={(e) =>
                      setForm({ ...form, stage1_body: e.target.value })
                    }
                    rows={8}
                    disabled={pending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Merge fields: <code>{`{{name}}`}</code>,{" "}
                    <code>{`{{form_link}}`}</code>,{" "}
                    <code>{`{{deadline}}`}</code>,{" "}
                    <code>{`{{role_name}}`}</code>,{" "}
                    <code>{`{{job_post_url}}`}</code>.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="reminder_after_days">
                      Reminder after (days)
                    </Label>
                    <Input
                      id="reminder_after_days"
                      type="number"
                      min={1}
                      max={30}
                      value={form.reminder_after_days}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          reminder_after_days: Number(e.target.value) || 0,
                        })
                      }
                      disabled={pending}
                    />
                    <p className="text-xs text-muted-foreground">
                      Default 3 days. One reminder per candidate.
                    </p>
                  </div>

                  <Field
                    id="form_response_sheet_url"
                    label="Form response sheet URL"
                    type="url"
                    value={form.form_response_sheet_url}
                    onChange={(v) =>
                      setForm({ ...form, form_response_sheet_url: v })
                    }
                    placeholder="https://docs.google.com/spreadsheets/…"
                    disabled={pending}
                  />
                </div>
              </div>
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
              type="submit"
              disabled={!canSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Creating…" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
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
  required,
  disabled,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}
