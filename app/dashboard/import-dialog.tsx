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
  importCandidates,
  type ImportPayload,
} from "@/lib/api/candidates";
import type { ColumnMapping, ImportResult } from "@/lib/types";
import { candidatesQueryKey } from "./candidates-table";

export type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (result: ImportResult) => void;
};

type Step = 1 | 2 | 3;

const initialMapping: ColumnMapping = {
  full_name: "Full Name",
  role: "Role",
  email: "Email",
  linkedin_url: "LinkedIn URL",
};

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: ImportDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [sheetUrl, setSheetUrl] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);

  useEffect(() => {
    if (!open) {
      const reset = setTimeout(() => {
        setStep(1);
        setSheetUrl("");
        setCampaignId("");
        setMapping(initialMapping);
      }, 200);
      return () => clearTimeout(reset);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (payload: ImportPayload) => importCandidates(payload),
    onSuccess: (result) => {
      toast.success("Import complete", {
        description: `${result.imported} imported · ${result.skipped} skipped · ${result.errors.length} errors`,
      });
      queryClient.invalidateQueries({ queryKey: candidatesQueryKey });
      onImported?.(result);
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Import failed.";
      toast.error("Import failed", { description: message });
    },
  });

  const step1Valid =
    sheetUrl.trim().startsWith("http") &&
    sheetUrl.includes("docs.google.com") &&
    campaignId.trim().length > 0;
  const step2Valid =
    mapping.full_name.trim().length > 0 && mapping.role.trim().length > 0;

  function handlePrimary() {
    if (step === 1 && step1Valid) {
      setStep(2);
      return;
    }
    if (step === 2 && step2Valid) {
      setStep(3);
      return;
    }
    if (step === 3) {
      const cleanedMapping: ColumnMapping = {
        full_name: mapping.full_name.trim(),
        role: mapping.role.trim(),
      };
      if (mapping.email && mapping.email.trim().length > 0) {
        cleanedMapping.email = mapping.email.trim();
      }
      if (mapping.linkedin_url && mapping.linkedin_url.trim().length > 0) {
        cleanedMapping.linkedin_url = mapping.linkedin_url.trim();
      }

      mutation.mutate({
        google_sheet_url: sheetUrl.trim(),
        campaign_id: campaignId.trim(),
        column_mapping: cleanedMapping,
      });
    }
  }

  function handleBack() {
    if (mutation.isPending) return;
    if (step === 1) {
      onOpenChange(false);
      return;
    }
    setStep((step - 1) as Step);
  }

  const primaryLabel =
    step === 3
      ? mutation.isPending
        ? "Importing…"
        : "Import"
      : "Continue";
  const primaryDisabled =
    mutation.isPending ||
    (step === 1 && !step1Valid) ||
    (step === 2 && !step2Valid);

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
          <DialogTitle>Import candidates from Google Sheets</DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {stepDescription(step)}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sheet-url">Google Sheet URL</Label>
              <Input
                id="sheet-url"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Share the sheet with the service account email (see
                DEPLOYMENT.md).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-id">Campaign ID</Label>
              <Input
                id="campaign-id"
                placeholder="UUID of an existing campaign"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Campaign picker lands in v0.2 — paste the UUID for now.
              </p>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Type the exact header text from row 1 of your sheet for each
              field. Backend matches by header name.
            </p>
            <MappingField
              id="map-full-name"
              label="Full name column *"
              value={mapping.full_name}
              onChange={(v) => setMapping((m) => ({ ...m, full_name: v }))}
            />
            <MappingField
              id="map-role"
              label="Role column *"
              value={mapping.role}
              onChange={(v) => setMapping((m) => ({ ...m, role: v }))}
            />
            <MappingField
              id="map-email"
              label="Email column (optional)"
              value={mapping.email ?? ""}
              onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
            />
            <MappingField
              id="map-linkedin"
              label="LinkedIn URL column (optional)"
              value={mapping.linkedin_url ?? ""}
              onChange={(v) =>
                setMapping((m) => ({ ...m, linkedin_url: v }))
              }
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3 text-sm">
            <SummaryRow label="Sheet URL" value={sheetUrl} mono />
            <SummaryRow label="Campaign" value={campaignId} mono />
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-2 font-medium">Column mapping</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  full_name ←{" "}
                  <span className="font-mono text-foreground">
                    {mapping.full_name || "—"}
                  </span>
                </li>
                <li>
                  role ←{" "}
                  <span className="font-mono text-foreground">
                    {mapping.role || "—"}
                  </span>
                </li>
                <li>
                  email ←{" "}
                  <span className="font-mono text-foreground">
                    {mapping.email?.trim() || "(skipped)"}
                  </span>
                </li>
                <li>
                  linkedin_url ←{" "}
                  <span className="font-mono text-foreground">
                    {mapping.linkedin_url?.trim() || "(skipped)"}
                  </span>
                </li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Submitting will fetch the sheet and create candidate records.
              Rows missing required fields are reported back as errors.
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={mutation.isPending}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <Button
            type="button"
            onClick={handlePrimary}
            disabled={primaryDisabled}
          >
            {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MappingField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          mono
            ? "break-all font-mono text-xs text-foreground"
            : "text-foreground"
        }
      >
        {value || <span className="italic text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

function stepDescription(step: Step): string {
  switch (step) {
    case 1:
      return "paste the sheet URL and target campaign";
    case 2:
      return "map sheet columns to candidate fields";
    case 3:
      return "review and confirm";
  }
}
