import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import type { Campaign } from "@/lib/types";

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

  const body: Campaign & { counts_by_stage: { stage: string; count: number }[] } = {
    id: campaign.id,
    role_name: campaign.roleName,
    google_form_url: campaign.googleFormUrl,
    zoom_link: campaign.zoomLink,
    zoom_meeting_id: campaign.zoomMeetingId,
    zoom_passcode: campaign.zoomPasscode,
    interview_date: campaign.interviewDate,
    interview_time: campaign.interviewTime,
    interview_mode: campaign.interviewMode,
    status: campaign.status as Campaign["status"],
    created_at: campaign.createdAt.toISOString(),
    counts_by_stage: countsByStage.map((r) => ({ stage: r.stage, count: r.count })),
  };

  return NextResponse.json(body);
});
