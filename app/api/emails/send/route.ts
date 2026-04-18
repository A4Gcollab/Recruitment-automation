import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { candidates, campaigns, emailQueue, roleConfigs } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  candidate_id: z.string().uuid(),
  template_type: z.literal("stage1"),
});

export const POST = withAuth(async (req, _ctx, session) => {
  if (process.env.KILL_SWITCH_EMAIL === "true") {
    return ERR.killSwitch();
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return ERR.validation({ reason: "invalid JSON body" });
  }
  if (!parsed.success) return ERR.validation({ issues: parsed.error.flatten() });

  const { candidate_id, template_type } = parsed.data;

  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidate_id));
  if (!candidate) return ERR.candidateNotFound();
  if (!candidate.email) {
    return ERR.validation({ reason: "Candidate has no email on file" });
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, candidate.campaignId));
  if (!campaign) return ERR.campaignNotFound();

  // role_configs is optional context; if missing, the campaign row itself carries the form URL
  await db
    .select()
    .from(roleConfigs)
    .where(eq(roleConfigs.roleName, campaign.roleName))
    .limit(1);

  const today = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `${candidate_id}:${template_type}:${today}`;

  const [existing] = await db
    .select()
    .from(emailQueue)
    .where(and(eq(emailQueue.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (existing) {
    return ERR.alreadySent(`Template '${template_type}' already queued/sent today for this candidate`);
  }

  const [queued] = await db
    .insert(emailQueue)
    .values({
      candidateId: candidate_id,
      campaignId: candidate.campaignId,
      templateType: template_type,
      scheduledFor: new Date(),
      idempotencyKey,
    })
    .returning();

  await logAudit({
    actor: session.actor,
    action: "email.queued",
    entityType: "candidate",
    entityId: candidate_id,
    metadata: { template_type, idempotency_key: idempotencyKey, queue_id: queued!.id },
  });

  return NextResponse.json({ queued: true, idempotency_key: idempotencyKey });
});
