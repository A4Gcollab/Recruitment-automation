import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, candidates, whatsappQueue } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  template_name: z.string().min(1),
  candidate_ids: z.array(z.string().uuid()).min(1).max(500),
});

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  if (process.env.KILL_SWITCH_WHATSAPP === "true") {
    return NextResponse.json(
      { error: { code: "kill_switch_active", message: "WhatsApp kill switch is active" } },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return ERR.validation({ reason: "invalid JSON body" });
  }
  if (!parsed.success) return ERR.validation({ issues: parsed.error.flatten() });

  const { template_name, candidate_ids } = parsed.data;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.campaignNotFound();

  const ids = Array.from(new Set(candidate_ids));

  const fetched = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.campaignId, campaignId),
        inArray(candidates.id, ids),
      ),
    );
  const byId = new Map(fetched.map((c) => [c.id, c] as const));

  // Key is per-day so the same candidate can be re-contacted on a new day
  // (reminder / re-engagement). Within the same day it stays idempotent.
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const idemKeyFor = (cid: string) =>
    `wa:${campaignId}:${template_name}:${cid}:${today}`;
  const idemKeys = ids.map(idemKeyFor);
  // Only block if there's an active (pending/processing) item — not already-sent ones
  const existingRows = idemKeys.length === 0
    ? []
    : await db
        .select({ idempotencyKey: whatsappQueue.idempotencyKey })
        .from(whatsappQueue)
        .where(
          and(
            inArray(whatsappQueue.idempotencyKey, idemKeys),
            inArray(whatsappQueue.status, ["pending", "processing"]),
          ),
        );
  const existingKeys = new Set(existingRows.map((r) => r.idempotencyKey));

  type SkipReason = "candidate_not_found" | "no_phone" | "already_sent";
  const skipped: Array<{ candidate_id: string; reason: SkipReason }> = [];
  const toInsert: Array<{
    candidateId: string;
    campaignId: string;
    templateName: string;
    templateParams: string[];
    scheduledFor: Date;
    idempotencyKey: string;
  }> = [];

  const formLink = campaign.googleFormUrl ?? "";

  for (const cid of ids) {
    const c = byId.get(cid);
    if (!c) {
      skipped.push({ candidate_id: cid, reason: "candidate_not_found" });
      continue;
    }
    if (!c.phone || !c.phone.trim()) {
      skipped.push({ candidate_id: cid, reason: "no_phone" });
      continue;
    }

    const idemKey = idemKeyFor(cid);
    if (existingKeys.has(idemKey)) {
      skipped.push({ candidate_id: cid, reason: "already_sent" });
      continue;
    }

    const firstName = c.fullName.trim().split(/\s+/)[0] ?? c.fullName;

    // Build template params based on which template is being sent
    let templateParams: string[];
    if (template_name === "a4g_interview_invite_v1") {
      templateParams = [
        firstName,
        campaign.roleName,
        campaign.interviewDate ?? "",
        campaign.interviewTime ?? "",
        campaign.interviewMode ?? "Zoom",
        campaign.zoomLink ?? "",
        campaign.zoomMeetingId ?? "",
        campaign.zoomPasscode ?? "",
      ];
    } else {
      templateParams = [firstName, campaign.roleName, formLink, campaign.jobPostUrl ?? ""];
    }

    toInsert.push({
      candidateId: cid,
      campaignId,
      templateName: template_name,
      templateParams,
      scheduledFor: new Date(),
      idempotencyKey: idemKey,
    });
  }

  let queued = 0;
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(whatsappQueue)
      .values(toInsert)
      .onConflictDoNothing({ target: whatsappQueue.idempotencyKey })
      .returning({ id: whatsappQueue.id, candidateId: whatsappQueue.candidateId });
    queued = inserted.length;

    for (const row of inserted) {
      await logAudit({
        actor: session.actor,
        action: "whatsapp.queued.bulk",
        entityType: "candidate",
        entityId: row.candidateId,
        metadata: {
          campaign_id: campaignId,
          template_name,
          queue_id: row.id,
        },
      });
    }

    if (inserted.length < toInsert.length) {
      const insertedCids = new Set(inserted.map((r) => r.candidateId));
      for (const r of toInsert) {
        if (!insertedCids.has(r.candidateId)) {
          skipped.push({ candidate_id: r.candidateId, reason: "already_sent" });
        }
      }
    }
  }

  await logAudit({
    actor: session.actor,
    action: "whatsapp.queued.bulk.summary",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      template_name,
      requested: ids.length,
      queued,
      skipped_count: skipped.length,
    },
  });

  return NextResponse.json({ queued, skipped });
});
