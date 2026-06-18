import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
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

  return NextResponse.json({ items, total: items.length });
});
