import { NextResponse } from "next/server";
import { desc, eq, min } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates, formResponses } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export type StoredFormResponse = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string | null;
  candidate_stage: string;
  submitted_at: string;
  responses: Record<string, string>;
};

export const GET = withAuth<Ctx>(async (_req, ctx) => {
  const { id: campaignId } = await ctx.params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.notFound("Campaign");

  // Auto-detect earliest Stage 1 send date for this campaign
  // — whichever came first: email stage1_sent_at or WA wa_last_sent_at
  const [sendDateRow] = await db
    .select({ earliest: min(candidates.stage1SentAt) })
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId));

  const [waSendDateRow] = await db
    .select({ earliest: min(candidates.waLastSentAt) })
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId));

  const emailDate = sendDateRow?.earliest ?? null;
  const waDate = waSendDateRow?.earliest ?? null;

  let autoFromDate: string | null = null;
  if (emailDate && waDate) {
    autoFromDate = (emailDate < waDate ? emailDate : waDate).toISOString().slice(0, 10);
  } else if (emailDate) {
    autoFromDate = emailDate.toISOString().slice(0, 10);
  } else if (waDate) {
    autoFromDate = waDate.toISOString().slice(0, 10);
  }

  const rows = await db
    .select({
      id: formResponses.id,
      candidateId: formResponses.candidateId,
      submittedAt: formResponses.submittedAt,
      responses: formResponses.responses,
      fullName: candidates.fullName,
      email: candidates.email,
      stage: candidates.stage,
    })
    .from(formResponses)
    .innerJoin(candidates, eq(formResponses.candidateId, candidates.id))
    .where(eq(formResponses.campaignId, campaignId))
    .orderBy(desc(formResponses.submittedAt));

  const items: StoredFormResponse[] = rows.map((r) => ({
    id: r.id,
    candidate_id: r.candidateId,
    candidate_name: r.fullName,
    candidate_email: r.email,
    candidate_stage: r.stage,
    submitted_at: r.submittedAt.toISOString(),
    responses: r.responses as Record<string, string>,
  }));

  return NextResponse.json({ items, total: items.length, auto_from_date: autoFromDate });
});
