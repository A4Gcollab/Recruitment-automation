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
import {
  ApiClientError,
  createCampaign,
  type CreateCampaignPayload,
} from "@/lib/api/candidates";
import { campaignsQueryKey } from "./campaign-list";

const emptyForm: CreateCampaignPayload = {
  role_name: "",
  google_form_url: "",
  zoom_link: "",
  zoom_meeting_id: "",
  zoom_passcode: "",
  interview_date: "",
  interview_time: "",
  interview_mode: "Zoom",
};

export function CreateCampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateCampaignPayload>(emptyForm);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setForm(emptyForm), 200);
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
    const optional: (keyof CreateCampaignPayload)[] = [
      "google_form_url",
      "zoom_link",
      "zoom_meeting_id",
      "zoom_passcode",
      "interview_date",
      "interview_time",
      "interview_mode",
    ];
    for (const key of optional) {
      const val = form[key]?.trim();
      if (val) (payload as Record<string, string>)[key] = val;
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>
            One campaign per hiring cycle / role. Interview details can be
            updated later.
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
          <Field
            id="google_form_url"
            label="Google Form URL"
            type="url"
            value={form.google_form_url}
            onChange={(v) => setForm({ ...form, google_form_url: v })}
            placeholder="https://forms.gle/…"
            disabled={pending}
          />

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

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
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
