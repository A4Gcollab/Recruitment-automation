"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  ExternalLink,
  GraduationCap,
  Mail,
  Phone,
  MapPin,
  X,
  FileText,
  Link2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StageMoveDropdown } from "@/components/ui/stage-move-dropdown";
import { fetchStoredFormResponses } from "@/lib/api/candidates";
import type { Candidate } from "@/lib/api/candidates";
import { candidatesQueryKey } from "./candidates-table";

// Keys that are NOT screening questions (standard import columns)
const STANDARD_KEYS = new Set([
  "name", "full name", "candidate name", "full_name",
  "email", "email address", "e-mail",
  "phone", "phone number", "mobile",
  "linkedin", "linkedin url", "linkedin profile", "profile url",
  "role", "position", "applied for",
  "headline", "linkedin headline",
  "title", "job title", "current title",
  "company", "current company", "employer",
  "school", "university", "college",
  "location", "city", "region",
  "date", "applied date", "application date", "applied on",
  "resume", "resume url", "resume link", "cv",
  "score", "screening score", "match score",
  "status", "linkedin status", "linkedin rating",
  "s no", "s. no", "serial", "sno",
]);

function isScreeningQuestion(key: string): boolean {
  return !STANDARD_KEYS.has(key.toLowerCase().trim());
}

function avatarInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function avatarColor(name: string): string {
  const colors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500",
    "bg-amber-500", "bg-rose-500", "bg-indigo-500",
    "bg-teal-500", "bg-cyan-500",
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function LinkedInFitBadge({ fit }: { fit: string | null }) {
  if (!fit) return null;
  const lower = fit.toLowerCase();
  if (lower === "good_fit" || lower === "good fit") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        Good Fit
      </span>
    );
  }
  if (lower === "disqualified") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
        Disqualified
      </span>
    );
  }
  if (lower === "reviewed") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Reviewed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {fit}
    </span>
  );
}

function ScoreBadge({ score }: { score: string | null }) {
  if (!score) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
      {score} Q&apos;s
    </span>
  );
}

function FormResponsesSection({
  campaignId,
  candidateId,
}: {
  campaignId: string;
  candidateId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["form-responses", campaignId, candidateId],
    queryFn: async () => {
      const res = await fetch(
        `/api/campaigns/${campaignId}/form-responses?candidate_id=${candidateId}`,
        { credentials: "include" },
      );
      if (!res.ok) return { items: [] };
      return res.json() as Promise<{ items: { submitted_at: string; responses: Record<string, string> }[] }>;
    },
  });

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        <FileText className="size-4 text-violet-500" />
        Google Form Responses
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : !data?.items.length ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
          No form responses yet.
        </p>
      ) : (
        <div className="space-y-4">
          {data.items.map((r, i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
            >
              <p className="mb-2 text-[10px] text-slate-400">
                Submitted {new Date(r.submitted_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <dl className="space-y-1.5">
                {Object.entries(r.responses).map(([q, a]) => (
                  <div key={q}>
                    <dt className="text-[11px] text-slate-500">{q}</dt>
                    <dd className="text-xs font-medium text-slate-800 dark:text-slate-200">{a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ScreeningQAGrid({ linkedinData }: { linkedinData: Record<string, string> }) {
  const questions = Object.entries(linkedinData).filter(([k]) =>
    isScreeningQuestion(k),
  );

  if (!questions.length) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
        Screening Questions
        <span className="ml-2 text-xs font-normal text-slate-400">
          ({questions.filter(([, v]) => v.toLowerCase() === "yes").length}/{questions.length} yes)
        </span>
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {questions.map(([question, answer], idx) => {
          const isYes = answer.toLowerCase() === "yes";
          const isNo = answer.toLowerCase() === "no";
          return (
            <div
              key={idx}
              className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
            >
              <p className="mb-0.5 text-[10px] font-medium text-slate-400">
                Q{idx + 1}
              </p>
              <p className="mb-2 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                {question}
              </p>
              <p
                className={`text-xs font-bold ${
                  isYes
                    ? "text-emerald-600 dark:text-emerald-400"
                    : isNo
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {answer}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CandidateProfileDrawer({
  candidate,
  campaignId,
  open,
  onOpenChange,
}: {
  candidate: Candidate | null;
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const candidatesQKey = candidatesQueryKey(campaignId);

  if (!candidate) return null;

  const initials = avatarInitials(candidate.full_name);
  const avatarBg = avatarColor(candidate.full_name);
  const screeningQs = Object.entries(candidate.linkedin_data ?? {}).filter(
    ([k]) => isScreeningQuestion(k),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-2xl"
      >
        {/* Close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <SheetHeader className="border-b border-slate-100 bg-white px-6 pb-4 pt-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className={`flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${avatarBg}`}
            >
              {initials}
            </div>

            {/* Name + badges */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {candidate.full_name}
                </SheetTitle>
                <ScoreBadge score={candidate.applicantsync_score} />
                <LinkedInFitBadge fit={candidate.linkedin_fit} />
              </div>

              {/* Role + company */}
              {(candidate.current_title || candidate.current_company) && (
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  {candidate.current_title && (
                    <span className="font-medium">{candidate.current_title}</span>
                  )}
                  {candidate.current_title && candidate.current_company && " at "}
                  {candidate.current_company}
                </p>
              )}

              {/* Headline */}
              {candidate.headline && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {candidate.headline}
                </p>
              )}

              {/* School */}
              {candidate.school && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <GraduationCap className="mr-1 inline size-3" />
                  {candidate.school}
                </p>
              )}

              {/* Location + date + icons */}
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                {candidate.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {candidate.location}
                  </span>
                )}
                {candidate.application_date && (
                  <span>Applied {candidate.application_date}</span>
                )}
                {candidate.email && (
                  <a href={`mailto:${candidate.email}`} title={candidate.email}>
                    <Mail className="size-3.5 hover:text-blue-500" />
                  </a>
                )}
                {candidate.phone && (
                  <a href={`tel:${candidate.phone}`} title={candidate.phone}>
                    <Phone className="size-3.5 hover:text-emerald-500" />
                  </a>
                )}
                {candidate.linkedin_url && (
                  <a
                    href={candidate.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    title="LinkedIn profile"
                  >
                    <Link2 className="size-3.5 hover:text-blue-600" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Action row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StageMoveDropdown
              candidateId={candidate.id}
              currentStage={candidate.stage}
              candidatesQueryKey={candidatesQKey}
              size="md"
            />
            {candidate.resume_url && (
              <a
                href={candidate.resume_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
              >
                <FileText className="size-3.5" />
                Resume
                <ExternalLink className="size-3 text-slate-400" />
              </a>
            )}
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 space-y-6 px-6 py-5">
          {/* 3 Info cards */}
          <div className="grid grid-cols-3 gap-3">
            {/* Contact */}
            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Mail className="size-3" /> Contact
              </p>
              {candidate.email && (
                <a
                  href={`mailto:${candidate.email}`}
                  className="block truncate text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  {candidate.email}
                </a>
              )}
              {candidate.phone && (
                <a
                  href={`tel:${candidate.phone}`}
                  className="mt-1 block text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  {candidate.phone}
                </a>
              )}
              {candidate.location && (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="size-3" />
                  {candidate.location}
                </p>
              )}
              {!candidate.email && !candidate.phone && !candidate.location && (
                <p className="text-xs text-slate-300">—</p>
              )}
            </div>

            {/* LinkedIn Rating */}
            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                LinkedIn Rating
              </p>
              <LinkedInFitBadge fit={candidate.linkedin_fit} />
              {!candidate.linkedin_fit && (
                <p className="text-xs text-slate-300">—</p>
              )}
              {candidate.applicantsync_score && (
                <p className="mt-2 text-xs text-slate-500">
                  Score: <span className="font-semibold">{candidate.applicantsync_score}</span>
                </p>
              )}
            </div>

            {/* Applied For */}
            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Applied For
              </p>
              <p className="text-xs font-medium text-teal-600 dark:text-teal-400">
                Tech Systems & Products
              </p>
              <p className="mt-0.5 text-xs text-slate-500">at A4G Impact Collaborative</p>
            </div>
          </div>

          {/* Work Experience */}
          {(candidate.current_title || candidate.current_company) && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <Briefcase className="size-4 text-blue-500" />
                Work Experience
              </h3>
              <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  {candidate.current_title ?? "—"}
                </p>
                {candidate.current_company && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {candidate.current_company}
                    {candidate.location ? ` · ${candidate.location}` : ""}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Education */}
          {candidate.school && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <GraduationCap className="size-4 text-violet-500" />
                Education
              </h3>
              <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  {candidate.school}
                </p>
              </div>
            </section>
          )}

          {/* Screening Questions */}
          {screeningQs.length > 0 && (
            <ScreeningQAGrid linkedinData={candidate.linkedin_data} />
          )}

          {/* Google Form Responses */}
          <FormResponsesSection
            campaignId={campaignId}
            candidateId={candidate.id}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
