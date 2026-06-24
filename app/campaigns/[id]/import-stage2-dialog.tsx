"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
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
import { importStage2, type ImportStage2Result } from "@/lib/api/candidates";
import { campaignQueryKey } from "./campaign-detail-view";
import { candidatesQueryKey } from "./candidates-table";

export function ImportStage2Dialog({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportStage2Result | null>(null);

  const mutation = useMutation({
    mutationFn: () => importStage2(campaignId, file!),
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Stage 2 import done`, {
        description: `${data.updated} candidates moved to Stage 2 · ${data.unmatched.length} unmatched`,
      });
      queryClient.invalidateQueries({ queryKey: candidatesQueryKey(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignQueryKey(campaignId) });
    },
    onError: () => toast.error("Import failed — check the file and try again"),
  });

  function handleClose(next: boolean) {
    if (mutation.isPending) return;
    if (!next) {
      setFile(null);
      setResult(null);
    }
    onOpenChange(next);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Stage 2 Shortlist</DialogTitle>
          <DialogDescription>
            Upload an Excel/CSV file with the names and emails of shortlisted
            candidates. The system will match them to existing candidates and
            move them to Stage 2.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <Upload className="size-8 text-slate-300" />
            {file ? (
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {file.name}
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Click to choose file
                </p>
                <p className="text-xs text-slate-400">
                  Excel (.xlsx) or CSV — needs a Name and/or Email column
                </p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFileChange}
          />

          {/* Results */}
          {result && (
            <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                <span>
                  <strong>{result.updated}</strong> candidates moved to Stage 2
                </span>
              </div>
              {result.unmatched.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <XCircle className="size-4" />
                    <span>
                      <strong>{result.unmatched.length}</strong> not found in this campaign:
                    </span>
                  </div>
                  <ul className="ml-6 space-y-0.5 text-xs text-slate-500">
                    {result.unmatched.slice(0, 10).map((u, i) => (
                      <li key={i}>
                        {u.name || u.email || "—"}
                      </li>
                    ))}
                    {result.unmatched.length > 10 && (
                      <li className="italic">
                        +{result.unmatched.length - 10} more…
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={mutation.isPending}
          >
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!file || mutation.isPending}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {mutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : null}
              {mutation.isPending ? "Importing…" : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
