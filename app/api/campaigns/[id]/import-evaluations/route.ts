import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";
import { findHeader, parseXlsxBuffer } from "@/lib/xlsx";
import type {
  EvaluationImportResult,
  EvaluationImportUnmatched,
  InterviewVerdict,
  Verdict,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Accept light variations on the canonical header names. Case-insensitive.
const EMAIL_HEADERS = ["email", "email address", "e-mail"];
const LINKEDIN_HEADERS = ["linkedin_url", "linkedin url", "linkedin"];
const SCREEN1_VERDICT_HEADERS = ["verdict", "screen1_verdict", "screen_1_verdict"];
const SCREEN1_REASON_HEADERS = ["reason", "screen1_reason"];
const SCREEN2_VERDICT_HEADERS = [
  "interview_verdict",
  "interview verdict",
  "screen2_verdict",
];
const SCREEN2_REASON_HEADERS = [
  "interview_reason",
  "interview reason",
  "screen2_reason",
];

const VALID_SCREEN1: ReadonlySet<Verdict> = new Set(["good_fit", "not_fit"]);
const VALID_SCREEN2: ReadonlySet<InterviewVerdict> = new Set([
  "call_interview",
  "reject",
]);

function normVerdict(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return t === "" ? null : t;
}

function normLinkedin(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase().replace(/\/+$/, "");
  return t === "" ? null : t;
}

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.campaignNotFound();

  // ---- Parse multipart -----------------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return ERR.validation({ reason: "invalid multipart body" });
  }
  const typeRaw = form.get("type");
  const fileEntry = form.get("file");
  if (typeof typeRaw !== "string" || (typeRaw !== "screen1" && typeRaw !== "screen2")) {
    return ERR.validation({ reason: "type must be 'screen1' or 'screen2'" });
  }
  if (!(fileEntry instanceof Blob)) {
    return ERR.validation({ reason: "file field missing or not a file" });
  }
  const type = typeRaw as "screen1" | "screen2";

  let parsed;
  try {
    const buf = Buffer.from(await fileEntry.arrayBuffer());
    parsed = parseXlsxBuffer(buf);
  } catch (err) {
    return ERR.validation({
      reason: `could not parse XLSX: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return ERR.validation({ reason: "empty XLSX" });
  }

  // ---- Find required columns ----------------------------------------------
  const emailCol = findHeader(parsed.headers, EMAIL_HEADERS);
  const linkedinCol = findHeader(parsed.headers, LINKEDIN_HEADERS);
  const verdictCol = findHeader(
    parsed.headers,
    type === "screen1" ? SCREEN1_VERDICT_HEADERS : SCREEN2_VERDICT_HEADERS,
  );
  const reasonCol = findHeader(
    parsed.headers,
    type === "screen1" ? SCREEN1_REASON_HEADERS : SCREEN2_REASON_HEADERS,
  );

  if (!emailCol && !linkedinCol) {
    return ERR.validation({
      reason: "XLSX must have an email or linkedin_url column for candidate matching",
    });
  }
  if (!verdictCol) {
    const expected =
      type === "screen1" ? "verdict" : "interview_verdict";
    return ERR.validation({ reason: `XLSX missing required column '${expected}'` });
  }

  // ---- Build lookup maps over existing candidates --------------------------
  const existing = await db
    .select()
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId));

  const byEmail = new Map<string, (typeof existing)[number]>();
  const byLinkedin = new Map<string, (typeof existing)[number]>();
  for (const c of existing) {
    const e = normEmail(c.email);
    if (e) byEmail.set(e, c);
    const l = normLinkedin(c.linkedinUrl);
    if (l) byLinkedin.set(l, c);
  }

  // ---- Determine stage transitions ----------------------------------------
  const stageGuard =
    type === "screen1"
      ? (s: string) => s === "imported" // only imported → evaluated_screen1 / rejected_screen1
      : (s: string) => s === "form_submitted"; // → evaluated_screen2 / rejected_screen2

  function targetStage(verdict: string): string | null {
    if (type === "screen1") {
      if (verdict === "good_fit") return "evaluated_screen1";
      if (verdict === "not_fit") return "rejected_screen1";
      return null;
    }
    if (verdict === "call_interview") return "evaluated_screen2";
    if (verdict === "reject") return "rejected_screen2";
    return null;
  }

  // ---- Walk rows, plan updates --------------------------------------------
  const unmatched: EvaluationImportUnmatched[] = [];
  let matched = 0;
  let updated = 0;

  // 1-indexed including header → first data row is index 1, XLSX row 2.
  let rowNum = 1;
  for (const r of parsed.rows) {
    rowNum++;
    const emailCell = emailCol ? r[emailCol] : "";
    const linkedinCell = linkedinCol ? r[linkedinCol] : "";
    const e = normEmail(emailCell);
    const l = normLinkedin(linkedinCell);
    const verdictRaw = r[verdictCol] ?? "";

    // Skip silently if the row has neither identity column AND no verdict —
    // probably a trailing blank row that snuck past blankrows:false.
    if (!e && !l && !verdictRaw.trim()) continue;

    const candidate =
      (e && byEmail.get(e)) || (l && byLinkedin.get(l)) || null;

    if (!candidate) {
      unmatched.push({
        row: rowNum,
        email: e,
        linkedin_url: l,
        reason: "no_match",
      });
      continue;
    }

    if (!verdictRaw.trim()) {
      unmatched.push({
        row: rowNum,
        email: e,
        linkedin_url: l,
        reason: "missing_verdict",
      });
      continue;
    }

    const verdict = normVerdict(verdictRaw);
    const isValid =
      type === "screen1"
        ? VALID_SCREEN1.has(verdict as Verdict)
        : VALID_SCREEN2.has(verdict as InterviewVerdict);
    if (!isValid) {
      unmatched.push({
        row: rowNum,
        email: e,
        linkedin_url: l,
        reason: "invalid_verdict",
      });
      continue;
    }

    if (!stageGuard(candidate.stage)) {
      unmatched.push({
        row: rowNum,
        email: e,
        linkedin_url: l,
        reason: "wrong_stage",
      });
      continue;
    }

    matched++;

    const nextStage = targetStage(verdict)!;
    const reasonText = reasonCol ? (r[reasonCol] ?? "").trim() : "";
    const before = {
      stage: candidate.stage,
      verdict: candidate.verdict,
      reason: candidate.reason,
      interview_verdict: candidate.interviewVerdict,
      interview_reason: candidate.interviewReason,
    };

    if (type === "screen1") {
      await db
        .update(candidates)
        .set({
          verdict,
          reason: reasonText || null,
          stage: nextStage,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, candidate.id));
    } else {
      await db
        .update(candidates)
        .set({
          interviewVerdict: verdict,
          interviewReason: reasonText || null,
          stage: nextStage,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, candidate.id));
    }
    updated++;

    await logAudit({
      actor: session.actor,
      action:
        type === "screen1"
          ? "evaluations.imported.screen1"
          : "evaluations.imported.screen2",
      entityType: "candidate",
      entityId: candidate.id,
      before,
      after: {
        stage: nextStage,
        verdict: type === "screen1" ? verdict : candidate.verdict,
        reason: type === "screen1" ? reasonText : candidate.reason,
        interview_verdict: type === "screen2" ? verdict : candidate.interviewVerdict,
        interview_reason: type === "screen2" ? reasonText : candidate.interviewReason,
      },
      metadata: { campaign_id: campaignId, xlsx_row: rowNum, type },
    });
  }

  // Roll-up audit for the whole import.
  await logAudit({
    actor: session.actor,
    action: "evaluations.imported.summary",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      type,
      matched,
      updated,
      unmatched_count: unmatched.length,
      header_row: parsed.headers,
    },
  });

  const body: EvaluationImportResult = { matched, updated, unmatched };
  return NextResponse.json(body);
});
