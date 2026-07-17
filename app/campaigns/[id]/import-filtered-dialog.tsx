"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Users } from "lucide-react";
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
  importFiltered,
  type ImportFilteredResult,
} from "@/lib/api/candidates";
import { campaignQueryKey } from "./campaign-detail-view";
import { candidatesQueryKey } from "./candidates-table";

const UNMATCHED_PREVIEW = 8;

export function ImportFilteredDialog({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const goodfitInputRef = useRef<HTMLInputElement>(null);
  const dataInputRef = useRef<HTMLInputElement>(null);
  const [goodfitFile, setGoodfitFile] = useState<File | null>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);

  function reset() {
    setGoodfitFile(null);
    setDataFile(null);
    if (goodfitInputRef.current) goodfitInputRef.current.value = "";
    if (dataInputRef.current) dataInputRef.current.value = "";
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!goodfitFile || !dataFile) {
        throw new Error("Both files are required");
      }
      return importFiltered(campaignId, goodfitFile, dataFile);
    },
    onSuccess: (result: ImportFilteredResult) => {
      toast.success("Good Fit import complete", {
        description: `${result.imported} new · ${result.skipped_existing} already existed (tagged Good Fit) · ${result.skipped_no_email} without email.`,
      });
      queryClient.invalidateQueries({
        queryKey: candidatesQueryKey(campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: campaignQueryKey(campaignId),
      });

      // If anyone in the good-fit list didn't match, show them as a secondary toast
      // so HR knows which candidates need manual follow-up.
      if (result.unmatched_goodfit_names.length > 0) {
        const preview = result.unmatched_goodfit_names
          .slice(0, UNMATCHED_PREVIEW)
          .join(", ");
        const more =
          result.unmatched_goodfit_names.length > UNMATCHED_PREVIEW
            ? ` + ${result.unmatched_goodfit_names.length - UNMATCHED_PREVIEW} more`
            : "";
        toast.warning(
          `${result.unmatched_goodfit_names.length} good-fit name${
            result.unmatched_goodfit_names.length === 1 ? "" : "s"
          } not found in ApplicantSync export`,
          { description: preview + more, duration: 12000 },
        );
      }

      reset();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiClientError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Unknown error";
      toast.error("Filtered import failed", { description: message });
    },
  });

  const canSubmit = !!goodfitFile && !!dataFile && !mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import filtered candidates</DialogTitle>
          <DialogDescription>
            Upload two files. The system matches names from the
            <strong> Good-Fit list</strong> against the
            <strong> ApplicantSync export</strong> and imports only the matching
            candidates with their full ApplicantSync details (email, phone,
            LinkedIn, etc.).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <FileInputBlock
            label="1. Good-Fit list (CSV from LinkedIn exporter)"
            hint="Required column: Name. Other columns are ignored."
            fileName={goodfitFile?.name ?? null}
            inputRef={goodfitInputRef}
            onChange={(f) => setGoodfitFile(f)}
          />

          <FileInputBlock
            label="2. ApplicantSync export (CSV or XLSX with full data)"
            hint="Required column: Name. Will also pull Email, Phone, LinkedIn URL, Title, Company, School, Location, Resume URL, Screening Score if present."
            fileName={dataFile?.name ?? null}
            inputRef={dataInputRef}
            onChange={(f) => setDataFile(f)}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Matching + importing…
              </>
            ) : (
              <>
                <Users />
                Match &amp; import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileInputBlock({
  label,
  hint,
  fileName,
  inputRef,
  onChange,
}: {
  label: string;
  hint: string;
  fileName: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          <FileUp />
          {fileName ? "Replace…" : "Choose file…"}
        </Button>
        <span className="text-xs text-muted-foreground truncate">
          {fileName ?? <em>(no file selected)</em>}
        </span>
      </div>
    </div>
  );
}
