"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
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
import type { ColumnMapping } from "@/lib/types";
import { candidatesQueryKey } from "./candidates-table";
import { campaignQueryKey } from "./campaign-detail-view";

type Step = 1 | 2 | 3;

type MappingState = {
  full_name: string;
  email: string;
  phone: string;
  linkedin_url: string;
  headline: string;
  location: string;
  application_date: string;
  role: string;
};

const initialMapping: MappingState = {
  full_name: "Name",
  email: "Email",
  phone: "Phone",
  linkedin_url: "LinkedIn URL",
  headline: "Headline",
  location: "Location",
  application_date: "Application Date",
  role: "",
};

export function ImportDialog({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<MappingState>(initialMapping);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep(1);
        setFile(null);
        setMapping(initialMapping);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (payload: ImportPayload) =>
      importCandidates(campaignId, payload),
    onSuccess: (result) => {
      toast.success("Import complete", {
        description: `${result.imported} imported · ${result.skipped} skipped · ${result.errors.length} errors`,
      });
      queryClient.invalidateQueries({ queryKey: candidatesQueryKey(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaignId) });
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

  const step1Valid = file !== null;
  const step2Valid = mapping.full_name.trim().length > 0;

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
      };
      const optional: (keyof MappingState)[] = [
        "email",
        "phone",
        "linkedin_url",
        "headline",
        "location",
        "application_date",
        "role",
      ];
      for (const key of optional) {
        const val = mapping[key].trim();
        if (val) (cleanedMapping as Record<string, string>)[key] = val;
      }
      mutation.mutate({
        file: file!,
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
          <DialogTitle>Import candidates from Excel</DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {stepDescription(step)}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="excel-file">Excel file (.xlsx)</Label>
              <label
                htmlFor="excel-file"
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
                  file
                    ? "border-blue-400 bg-blue-50/60 dark:border-blue-600 dark:bg-blue-950/30"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50"
                }`}
              >
                <Upload
                  className={`size-8 ${file ? "text-blue-500" : "text-slate-300"}`}
                />
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB · click to change
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Click to upload or drag & drop
                    </p>
                    <p className="text-xs text-slate-400">
                      Supports .xlsx and .xls files
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  id="excel-file"
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                First row must be the header row. Column names are used in the
                next step to map fields.
              </p>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Type the exact header text from row 1 of your file for each
              field. Only{" "}
              <span className="font-medium text-foreground">Full name</span> is
              required.
            </p>
            <MappingField
              id="map-full-name"
              label="Full name column *"
              value={mapping.full_name}
              onChange={(v) => setMapping((m) => ({ ...m, full_name: v }))}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MappingField
                id="map-email"
                label="Email"
                value={mapping.email}
                onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
              />
              <MappingField
                id="map-phone"
                label="Phone"
                value={mapping.phone}
                onChange={(v) => setMapping((m) => ({ ...m, phone: v }))}
              />
              <MappingField
                id="map-linkedin"
                label="LinkedIn URL"
                value={mapping.linkedin_url}
                onChange={(v) =>
                  setMapping((m) => ({ ...m, linkedin_url: v }))
                }
              />
              <MappingField
                id="map-headline"
                label="Headline"
                value={mapping.headline}
                onChange={(v) => setMapping((m) => ({ ...m, headline: v }))}
              />
              <MappingField
                id="map-location"
                label="Location"
                value={mapping.location}
                onChange={(v) => setMapping((m) => ({ ...m, location: v }))}
              />
              <MappingField
                id="map-appdate"
                label="Application date"
                value={mapping.application_date}
                onChange={(v) =>
                  setMapping((m) => ({ ...m, application_date: v }))
                }
              />
              <MappingField
                id="map-role"
                label="Role (override)"
                value={mapping.role}
                onChange={(v) => setMapping((m) => ({ ...m, role: v }))}
              />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3 text-sm">
            <SummaryRow label="File" value={file?.name ?? ""} />
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-2 font-medium">Column mapping</p>
              <ul className="space-y-1 text-muted-foreground">
                <MappingSummaryLine
                  field="full_name"
                  value={mapping.full_name}
                />
                <MappingSummaryLine field="email" value={mapping.email} />
                <MappingSummaryLine field="phone" value={mapping.phone} />
                <MappingSummaryLine
                  field="linkedin_url"
                  value={mapping.linkedin_url}
                />
                <MappingSummaryLine field="headline" value={mapping.headline} />
                <MappingSummaryLine field="location" value={mapping.location} />
                <MappingSummaryLine
                  field="application_date"
                  value={mapping.application_date}
                />
                <MappingSummaryLine field="role" value={mapping.role} />
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Submitting will parse the Excel file and create candidate records
              in this campaign. Rows missing a full name are skipped.
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
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="break-all font-mono text-xs text-foreground">
        {value || <span className="italic text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

function MappingSummaryLine({
  field,
  value,
}: {
  field: string;
  value: string;
}) {
  const trimmed = value.trim();
  return (
    <li>
      {field} ←{" "}
      <span className="font-mono text-foreground">
        {trimmed || "(skipped)"}
      </span>
    </li>
  );
}

function stepDescription(step: Step): string {
  switch (step) {
    case 1:
      return "upload your Excel file";
    case 2:
      return "map columns to candidate fields";
    case 3:
      return "review and confirm";
  }
}
