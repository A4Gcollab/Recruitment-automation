import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { candidates, campaigns, emailQueue, roleConfigs } from "@/db/schema";
import { sendEmail } from "@/lib/email/sender";
import { renderStage1 } from "@/lib/email/templates";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORG_NAME = "Omysha Foundation";

function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] ?? fullName;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultDeadline(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toUTCString();
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

  const delayMin = parseInt(process.env.SEND_DELAY_MIN_SECONDS ?? "30", 10);
  const delayMax = parseInt(process.env.SEND_DELAY_MAX_SECONDS ?? "60", 10);

  const pending = await db
    .select()
    .from(emailQueue)
    .where(and(eq(emailQueue.status, "pending"), lte(emailQueue.scheduledFor, new Date())))
    .orderBy(asc(emailQueue.scheduledFor))
    .limit(20);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i]!;

    // Claim the row
    const claimed = await db
      .update(emailQueue)
      .set({ status: "processing" })
      .where(and(eq(emailQueue.id, item.id), eq(emailQueue.status, "pending")))
      .returning();
    if (claimed.length === 0) continue; // another worker grabbed it

    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, item.candidateId));
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, item.campaignId));
    if (!candidate || !campaign || !candidate.email) {
      await db
        .update(emailQueue)
        .set({
          status: "failed",
          errorMessage: !candidate
            ? "candidate missing"
            : !campaign
              ? "campaign missing"
              : "no email on file",
        })
        .where(eq(emailQueue.id, item.id));
      failed++;
      continue;
    }

    const [roleConfig] = await db
      .select()
      .from(roleConfigs)
      .where(eq(roleConfigs.roleName, campaign.roleName))
      .limit(1);

    const formLink = campaign.googleFormUrl ?? roleConfig?.googleFormUrl ?? "";

    if (item.templateType !== "stage1") {
      await db
        .update(emailQueue)
        .set({ status: "failed", errorMessage: `Unknown template_type '${item.templateType}'` })
        .where(eq(emailQueue.id, item.id));
      failed++;
      continue;
    }

    const { subject, html, text } = renderStage1({
      candidateFirstName: firstName(candidate.fullName),
      roleName: campaign.roleName,
      orgName: ORG_NAME,
      formLink,
      deadline: defaultDeadline(),
    });

    const result = await sendEmail({ to: candidate.email, subject, html, text });

    if (result.sent) {
      await db
        .update(emailQueue)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(emailQueue.id, item.id));
      await db
        .update(candidates)
        .set({ stage: "stage1_sent", updatedAt: new Date() })
        .where(eq(candidates.id, candidate.id));
      await logAudit({
        actor: "system:cron",
        action: "email.sent",
        entityType: "candidate",
        entityId: candidate.id,
        metadata: {
          template_type: item.templateType,
          idempotency_key: item.idempotencyKey,
          message_id: result.messageId,
        },
      });
      processed++;
    } else if (result.queued) {
      // Re-queue: push scheduledFor forward to next window and flip back to pending
      const nextTry = new Date(Date.now() + 15 * 60 * 1000);
      await db
        .update(emailQueue)
        .set({ status: "pending", scheduledFor: nextTry })
        .where(eq(emailQueue.id, item.id));
      skipped++;
    } else {
      const retryCount = item.retryCount + 1;
      const terminal = retryCount >= 3;
      await db
        .update(emailQueue)
        .set({
          status: terminal ? "failed" : "pending",
          retryCount,
          errorMessage: result.error,
          scheduledFor: terminal
            ? item.scheduledFor
            : new Date(Date.now() + retryCount * 15 * 60 * 1000),
        })
        .where(eq(emailQueue.id, item.id));
      failed++;
    }

    if (i < pending.length - 1) {
      await sleep(randomBetween(delayMin, delayMax) * 1000);
    }
  }

  return NextResponse.json({ processed, skipped, failed });
}
