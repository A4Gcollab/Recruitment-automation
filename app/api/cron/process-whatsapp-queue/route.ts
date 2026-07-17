import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, lt, lte } from "drizzle-orm";
import { db } from "@/db";
import { candidates, campaigns, whatsappQueue, whatsappMessages } from "@/db/schema";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/sender";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
    return NextResponse.json({ processed: 0, skipped: 0, failed: 0, reason: "kill switch active" });
  }

  const delayMin = parseInt(process.env.SEND_DELAY_MIN_SECONDS ?? "30", 10);
  const delayMax = parseInt(process.env.SEND_DELAY_MAX_SECONDS ?? "60", 10);

  // Recover items stuck in "processing" for more than 10 minutes (crashed mid-run).
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  await db
    .update(whatsappQueue)
    .set({ status: "pending", scheduledFor: new Date() })
    .where(and(eq(whatsappQueue.status, "processing"), lt(whatsappQueue.scheduledFor, tenMinutesAgo)));

  const pending = await db
    .select()
    .from(whatsappQueue)
    .where(and(eq(whatsappQueue.status, "pending"), lte(whatsappQueue.scheduledFor, new Date())))
    .orderBy(asc(whatsappQueue.scheduledFor))
    .limit(20);

  let processed = 0;
  const skipped = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i]!;

    // Claim the row atomically
    const claimed = await db
      .update(whatsappQueue)
      .set({ status: "processing" })
      .where(and(eq(whatsappQueue.id, item.id), eq(whatsappQueue.status, "pending")))
      .returning();
    if (claimed.length === 0) continue;

    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, item.candidateId));
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, item.campaignId));

    if (!candidate || !campaign || !candidate.phone) {
      await db
        .update(whatsappQueue)
        .set({
          status: "failed",
          errorMessage: !candidate
            ? "candidate missing"
            : !campaign
              ? "campaign missing"
              : "no phone on file",
        })
        .where(eq(whatsappQueue.id, item.id));
      failed++;
      continue;
    }

    // Rebuild template params from live campaign+candidate data so that any
    // Zoom/interview details filled in after the initial queue are picked up.
    let params: string[];
    if (item.templateName === "a4g_interview_invite_v1") {
      const firstName = candidate.fullName.trim().split(/\s+/)[0] ?? candidate.fullName;
      params = [
        firstName,
        campaign.roleName,
        campaign.interviewDate ?? "",
        campaign.interviewTime ?? "",
        campaign.zoomLink ?? "",
        campaign.zoomMeetingId ?? "",
        campaign.zoomPasscode ?? "",
      ];
    } else {
      params = (item.templateParams as string[]) ?? [];
    }

    const result = await sendWhatsAppTemplate({
      to: candidate.phone,
      templateName: item.templateName,
      components: params.length > 0
        ? [{ type: "body", parameters: params.map((p) => ({ type: "text" as const, text: p })) }]
        : undefined,
    });

    if (result.sent) {
      await db
        .update(whatsappQueue)
        .set({ status: "sent", sentAt: new Date(), waMessageId: result.messageId })
        .where(eq(whatsappQueue.id, item.id));

      // Log the outbound message
      await db.insert(whatsappMessages).values({
        candidateId: candidate.id,
        campaignId: campaign.id,
        direction: "outbound",
        waMessageId: result.messageId,
        templateName: item.templateName,
        body: null,
        status: "sent",
      });

      // Update candidate's WA status
      await db
        .update(candidates)
        .set({ waStatus: "sent", waLastSentAt: new Date(), updatedAt: new Date() })
        .where(eq(candidates.id, candidate.id));

      await logAudit({
        actor: "system:cron",
        action: "whatsapp.sent",
        entityType: "candidate",
        entityId: candidate.id,
        metadata: {
          template_name: item.templateName,
          idempotency_key: item.idempotencyKey,
          wa_message_id: result.messageId,
        },
      });
      processed++;
    } else {
      const retryCount = item.retryCount + 1;
      const terminal = retryCount >= 3;
      await db
        .update(whatsappQueue)
        .set({
          status: terminal ? "failed" : "pending",
          retryCount,
          errorMessage: result.error,
          scheduledFor: terminal
            ? item.scheduledFor
            : new Date(Date.now() + retryCount * 15 * 60 * 1000),
        })
        .where(eq(whatsappQueue.id, item.id));
      failed++;
    }

    if (i < pending.length - 1) {
      await sleep(randomBetween(delayMin, delayMax) * 1000);
    }
  }

  return NextResponse.json({ processed, skipped, failed });
}
