import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";
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

const patchSchema = z.object({
  job_post_url: z.string().url().nullable().optional(),
  google_form_url: z.string().url().nullable().optional(),
  zoom_link: z.string().url().nullable().optional(),
  zoom_meeting_id: z.string().max(50).nullable().optional(),
  zoom_passcode: z.string().max(50).nullable().optional(),
  interview_date: z.string().max(100).nullable().optional(),
  interview_time: z.string().max(50).nullable().optional(),
  interview_mode: z.string().max(50).nullable().optional(),
});

export const PATCH = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id } = await ctx.params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return ERR.notFound("Campaign");

  let parsed;
  try {
    parsed = patchSchema.safeParse(await req.json());
  } catch {
    return ERR.validation({ reason: "invalid JSON body" });
  }
  if (!parsed.success) return ERR.validation({ issues: parsed.error.flatten() });

  const d = parsed.data;
  const updates: Partial<typeof campaigns.$inferInsert> = {};
  if (d.job_post_url !== undefined) updates.jobPostUrl = d.job_post_url;
  if (d.google_form_url !== undefined) updates.googleFormUrl = d.google_form_url;
  if (d.zoom_link !== undefined) updates.zoomLink = d.zoom_link;
  if (d.zoom_meeting_id !== undefined) updates.zoomMeetingId = d.zoom_meeting_id;
  if (d.zoom_passcode !== undefined) updates.zoomPasscode = d.zoom_passcode;
  if (d.interview_date !== undefined) updates.interviewDate = d.interview_date;
  if (d.interview_time !== undefined) updates.interviewTime = d.interview_time;
  if (d.interview_mode !== undefined) updates.interviewMode = d.interview_mode;

  const [updated] = await db
    .update(campaigns)
    .set(updates)
    .where(eq(campaigns.id, id))
    .returning();

  await logAudit({
    actor: session.actor,
    action: "campaign.updated",
    entityType: "campaign",
    entityId: id,
    before: campaign,
    after: updated,
  });

  return NextResponse.json(serializeCampaign(updated!));
});

export const DELETE = withAuth<Ctx>(async (_req: NextRequest, ctx, session) => {
  const { id } = await ctx.params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return ERR.notFound("Campaign");

  await db.delete(campaigns).where(eq(campaigns.id, id));

  await logAudit({
    actor: session.actor,
    action: "campaign.deleted",
    entityType: "campaign",
    entityId: id,
    metadata: { role_name: campaign.roleName },
  });

  return NextResponse.json({ deleted: true });
});
