import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { serializeCampaign } from "@/lib/serializers/campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return ERR.notFound("Campaign");

  const countsByStage = await db
    .select({
      stage: candidates.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(eq(candidates.campaignId, id))
    .groupBy(candidates.stage);

  return NextResponse.json({
    ...serializeCampaign(campaign),
    counts_by_stage: countsByStage.map((r) => ({ stage: r.stage, count: r.count })),
  });
});
