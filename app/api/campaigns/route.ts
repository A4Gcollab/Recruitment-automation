import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, roleConfigs } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { serializeCampaign } from "@/lib/serializers/campaign";

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
  // v0.2 — all optional; DB defaults from lib/email/defaults fill in if omitted
  stage1_subject: z.string().min(1).optional(),
  stage1_body: z.string().min(1).optional(),
  reminder_subject: z.string().min(1).optional(),
  reminder_body: z.string().min(1).optional(),
  interview_subject: z.string().min(1).optional(),
  interview_body: z.string().min(1).optional(),
  reminder_after_days: z.number().int().min(1).max(30).optional(),
  form_response_sheet_url: z.string().url().optional(),
});

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
      // v0.2 — omit when undefined so DB column DEFAULTs apply (defaults live in lib/email/defaults.ts)
      ...(d.stage1_subject !== undefined && { stage1Subject: d.stage1_subject }),
      ...(d.stage1_body !== undefined && { stage1Body: d.stage1_body }),
      ...(d.reminder_subject !== undefined && { reminderSubject: d.reminder_subject }),
      ...(d.reminder_body !== undefined && { reminderBody: d.reminder_body }),
      ...(d.interview_subject !== undefined && { interviewSubject: d.interview_subject }),
      ...(d.interview_body !== undefined && { interviewBody: d.interview_body }),
      ...(d.reminder_after_days !== undefined && { reminderAfterDays: d.reminder_after_days }),
      formResponseSheetUrl: d.form_response_sheet_url ?? null,
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
