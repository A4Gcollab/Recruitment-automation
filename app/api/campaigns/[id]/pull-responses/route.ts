import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, candidates, formResponses } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";
import {
  fetchFormResponses,
  SheetUnreachableError,
  SheetUpstreamError,
} from "@/lib/sheets/formResponses";
import type { PullResponsesResult, PullResponsesUnmatched } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  // Optional override; default reads campaign.form_response_sheet_url
  response_sheet_url: z.string().url().optional(),
  // Optional override of which form question holds the email
  email_question_header: z.string().min(1).optional(),
});

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.campaignNotFound();

  // Body is optional — both fields are. Empty body is fine.
  let parsed: { response_sheet_url?: string; email_question_header?: string } = {};
  try {
    const text = await req.text();
    if (text && text.trim()) {
      const json = JSON.parse(text);
      const result = bodySchema.safeParse(json);
      if (!result.success) {
        return ERR.validation({ issues: result.error.flatten() });
      }
      parsed = result.data;
    }
  } catch {
    return ERR.validation({ reason: "invalid JSON body" });
  }

  const sheetUrl = parsed.response_sheet_url ?? campaign.formResponseSheetUrl;
  if (!sheetUrl) {
    return ERR.validation({
      reason:
        "no response_sheet_url on the campaign and none provided in the request body — set it in the create-campaign dialog or pass it inline",
    });
  }

  // Fetch the Form response sheet
  let fetched;
  try {
    fetched = await fetchFormResponses({
      url: sheetUrl,
      emailQuestionHeader: parsed.email_question_header,
    });
  } catch (err) {
    if (err instanceof SheetUnreachableError) {
      return ERR.sheetUnreachable(err.message);
    }
    if (err instanceof SheetUpstreamError) {
      return ERR.sheetUpstream(err.message);
    }
    throw err;
  }

  const pulled = fetched.responses.length;
  const unmatched: PullResponsesUnmatched[] = [];

  // Load all candidates in this campaign to match by email
  const allCandidates = await db
    .select({
      id: candidates.id,
      email: candidates.email,
      stage: candidates.stage,
    })
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId));
  const byEmail = new Map<string, { id: string; stage: string }>();
  for (const c of allCandidates) {
    if (c.email) byEmail.set(c.email.toLowerCase().trim(), c);
  }

  // Walk responses, match to candidates
  type ToInsert = {
    candidateId: string;
    campaignId: string;
    responses: Record<string, string>;
    submittedAt: Date;
  };
  const toInsert: ToInsert[] = [];
  const candidateIdsToAdvance = new Set<string>();

  for (const r of fetched.responses) {
    if (!r.email) {
      unmatched.push({ row: r.row_number, email: null, reason: "missing_email" });
      continue;
    }
    const candidate = byEmail.get(r.email);
    if (!candidate) {
      unmatched.push({
        row: r.row_number,
        email: r.email,
        reason: "no_candidate_match",
      });
      continue;
    }
    toInsert.push({
      candidateId: candidate.id,
      campaignId,
      responses: r.answers,
      submittedAt: new Date(r.submitted_at!), // we already validated parseability
    });
    candidateIdsToAdvance.add(candidate.id);
  }

  // Insert into form_responses (idempotent — unique key is (candidate_id, submitted_at))
  let insertedCount = 0;
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(formResponses)
      .values(toInsert)
      .onConflictDoNothing({
        target: [formResponses.candidateId, formResponses.submittedAt],
      })
      .returning({ id: formResponses.id });
    insertedCount = inserted.length;
  }
  const deduped = toInsert.length - insertedCount;

  // Advance candidate stages from stage1_sent / reminder_sent → form_submitted
  let stageAdvanceCount = 0;
  if (candidateIdsToAdvance.size > 0) {
    const advanced = await db
      .update(candidates)
      .set({ stage: "form_submitted", updatedAt: new Date() })
      .where(
        and(
          eq(candidates.campaignId, campaignId),
          inArray(candidates.id, Array.from(candidateIdsToAdvance)),
          inArray(candidates.stage, ["stage1_sent", "reminder_sent", "imported"]),
        ),
      )
      .returning({ id: candidates.id });
    stageAdvanceCount = advanced.length;
  }

  await logAudit({
    actor: session.actor,
    action: "form_responses.pulled",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      sheet_url: sheetUrl,
      sheet_title: fetched.sheet_title,
      email_header: fetched.email_header,
      pulled,
      inserted: insertedCount,
      deduped,
      unmatched_count: unmatched.length,
      stage_advanced: stageAdvanceCount,
      sheet_parse_errors: fetched.errors,
    },
  });

  const body: PullResponsesResult = {
    pulled,
    matched: insertedCount,
    unmatched,
    deduped,
  };
  return NextResponse.json(body);
});
