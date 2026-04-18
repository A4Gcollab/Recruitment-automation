import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, roleConfigs } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import type { Campaign } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  role_name: z.string().min(1).max(255),
  google_form_url: z.string().url().optional(),
  zoom_link: z.string().url().optional(),
  zoom_meeting_id: z.string().max(50).optional(),
  zoom_passcode: z.string().max(50).optional(),
  interview_date: z.string().max(100).optional(),
  interview_time: z.string().max(50).optional(),
  interview_mode: z.string().max(50).optional(),
});

function serializeCampaign(row: typeof campaigns.$inferSelect): Campaign {
  return {
    id: row.id,
    role_name: row.roleName,
    google_form_url: row.googleFormUrl,
    zoom_link: row.zoomLink,
    zoom_meeting_id: row.zoomMeetingId,
    zoom_passcode: row.zoomPasscode,
    interview_date: row.interviewDate,
    interview_time: row.interviewTime,
    interview_mode: row.interviewMode,
    status: row.status as Campaign["status"],
    created_at: row.createdAt.toISOString(),
  };
}

export const POST = withAuth(async (req, _ctx, session) => {
  let parsed;
  try {
    parsed = createSchema.safeParse(await req.json());
  } catch {
    return ERR.validation({ reason: "invalid JSON body" });
  }
  if (!parsed.success) return ERR.validation({ issues: parsed.error.flatten() });

  const d = parsed.data;

  const [campaign] = await db
    .insert(campaigns)
    .values({
      roleName: d.role_name,
      googleFormUrl: d.google_form_url ?? null,
      zoomLink: d.zoom_link ?? null,
      zoomMeetingId: d.zoom_meeting_id ?? null,
      zoomPasscode: d.zoom_passcode ?? null,
      interviewDate: d.interview_date ?? null,
      interviewTime: d.interview_time ?? null,
      interviewMode: d.interview_mode ?? null,
    })
    .returning();

  const existing = await db
    .select()
    .from(roleConfigs)
    .where(eq(roleConfigs.roleName, d.role_name))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(roleConfigs).values({
      roleName: d.role_name,
      googleFormUrl: d.google_form_url ?? null,
      zoomLink: d.zoom_link ?? null,
      zoomMeetingId: d.zoom_meeting_id ?? null,
      zoomPasscode: d.zoom_passcode ?? null,
      defaultInterviewDate: d.interview_date ?? null,
      defaultInterviewTime: d.interview_time ?? null,
      interviewMode: d.interview_mode ?? null,
    });
  }

  await logAudit({
    actor: session.actor,
    action: "campaign.created",
    entityType: "campaign",
    entityId: campaign!.id,
    after: campaign,
  });

  return NextResponse.json(serializeCampaign(campaign!), { status: 201 });
});

export const GET = withAuth(async () => {
  const rows = await db.select().from(campaigns);
  return NextResponse.json({ items: rows.map(serializeCampaign) });
});
