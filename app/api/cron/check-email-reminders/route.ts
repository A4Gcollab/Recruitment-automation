import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates, emailQueue } from "@/db/schema";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email Reminder Cron
 * Finds candidates who:
 *   - are at stage 'stage1_sent'
 *   - have stage1SentAt set (populated when the stage-1 email was actually sent)
 *   - have NOT yet received a reminder (reminderSentAt IS NULL)
 *   - stage1SentAt is older than campaign.reminderAfterDays
 * and queues a 'reminder' email for each one.
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

  if (process.env.KILL_SWITCH_EMAIL === "true") {
    return NextResponse.json({ queued: 0, reason: "kill switch active" });
  }

  const allCampaigns = await db.select().from(campaigns);
  let totalQueued = 0;

  for (const campaign of allCampaigns) {
    const reminderDays = campaign.reminderAfterDays ?? 3;
    const cutoff = new Date(Date.now() - reminderDays * 24 * 60 * 60 * 1000);

    // Uses the reminderScanIdx: stage='stage1_sent' AND reminderSentAt IS NULL
    const due = await db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.campaignId, campaign.id),
          eq(candidates.stage, "stage1_sent"),
          isNotNull(candidates.stage1SentAt),
          lt(candidates.stage1SentAt, cutoff),
          isNull(candidates.reminderSentAt),
        ),
      );

    for (const candidate of due) {
      if (!candidate.email) continue;

      const idemKey = `email-reminder:${campaign.id}:${candidate.id}`;

      await db
        .insert(emailQueue)
        .values({
          candidateId: candidate.id,
          campaignId: campaign.id,
          templateType: "reminder",
          scheduledFor: new Date(),
          idempotencyKey: idemKey,
        })
        .onConflictDoNothing({ target: emailQueue.idempotencyKey });

      await logAudit({
        actor: "system:cron",
        action: "email.reminder_queued",
        entityType: "candidate",
        entityId: candidate.id,
        metadata: {
          campaign_id: campaign.id,
          reminder_after_days: reminderDays,
          stage1_sent_at: candidate.stage1SentAt?.toISOString(),
        },
      });

      totalQueued++;
    }
  }

  return NextResponse.json({ queued: totalQueued });
}
