import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNotNull, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates, whatsappQueue } from "@/db/schema";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WA Reminder Cron
 * Finds candidates who:
 *   - received a WhatsApp message (waLastSentAt is set)
 *   - have NOT replied (waStatus != 'replied')
 *   - waLastSentAt is older than campaign.reminderAfterDays
 *   - haven't had a reminder queued yet (idempotency key not in queue)
 * and queues the same template again as a reminder.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || header !== secret) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "CRON_SECRET missing or invalid" } },
      { status: 401 },
    );
  }

  if (process.env.KILL_SWITCH_WHATSAPP === "true") {
    return NextResponse.json({ queued: 0, reason: "kill switch active" });
  }

  const allCampaigns = await db.select().from(campaigns);
  let totalQueued = 0;

  for (const campaign of allCampaigns) {
    const reminderDays = campaign.reminderAfterDays ?? 3;
    const cutoff = new Date(Date.now() - reminderDays * 24 * 60 * 60 * 1000);

    // Find candidates who were sent WA but haven't replied and reminder is due
    const due = await db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.campaignId, campaign.id),
          isNotNull(candidates.waLastSentAt),
          lt(candidates.waLastSentAt, cutoff),
          ne(candidates.waStatus, "replied"),
        ),
      );

    for (const candidate of due) {
      if (!candidate.phone) continue;

      // One reminder per candidate per campaign — key doesn't include date
      const reminderKey = `wa-reminder:${campaign.id}:${candidate.id}`;

      // Skip if reminder already queued
      const [existing] = await db
        .select({ id: whatsappQueue.id })
        .from(whatsappQueue)
        .where(eq(whatsappQueue.idempotencyKey, reminderKey))
        .limit(1);
      if (existing) continue;

      const firstName = candidate.fullName.trim().split(/\s+/)[0] ?? candidate.fullName;
      const templateName = "a4g_outreach_v2"; // same template as initial send
      const formLink = campaign.googleFormUrl ?? "";

      await db.insert(whatsappQueue).values({
        candidateId: candidate.id,
        campaignId: campaign.id,
        templateName,
        templateParams: [firstName, campaign.roleName, formLink, campaign.jobPostUrl ?? ""],
        scheduledFor: new Date(),
        idempotencyKey: reminderKey,
      }).onConflictDoNothing();

      await logAudit({
        actor: "system:cron",
        action: "whatsapp.reminder_queued",
        entityType: "candidate",
        entityId: candidate.id,
        metadata: {
          campaign_id: campaign.id,
          reminder_after_days: reminderDays,
          wa_last_sent_at: candidate.waLastSentAt?.toISOString(),
        },
      });

      totalQueued++;
    }
  }

  return NextResponse.json({ queued: totalQueued });
}
