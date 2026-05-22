import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, candidates, emailQueue } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";
import type {
  BulkSendResult,
  BulkSendSkipReason,
  TemplateType,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  template_type: z.enum(["stage1", "interview_link"]),
  candidate_ids: z.array(z.string().uuid()).min(1).max(500),
});

// Per CONTRACTS §2.10:
// - stage1: candidate.verdict === 'good_fit' && stage === 'evaluated_screen1'
// - interview_link: candidate.interview_verdict === 'call_interview' && stage === 'evaluated_screen2'
// + has email + no prior queued/sent row with same idempotency key.

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

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

  const { template_type, candidate_ids } = parsed.data;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.campaignNotFound();

  // De-dupe input ids defensively.
  const ids = Array.from(new Set(candidate_ids));

  // Fetch the candidates in one round-trip, scoped to this campaign so an
  // attacker can't target candidates from someone else's campaign.
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

  // Find existing queue rows for this template_type so we can detect already_sent.
  const idemKeyFor = (cid: string) =>
    `bulk:${campaignId}:${template_type}:${cid}`;
  const idemKeys = ids.map(idemKeyFor);
  const existingQueueRows = idemKeys.length === 0
    ? []
    : await db
        .select({
          idempotencyKey: emailQueue.idempotencyKey,
          status: emailQueue.status,
        })
        .from(emailQueue)
        .where(inArray(emailQueue.idempotencyKey, idemKeys));
  const existingKeys = new Set(existingQueueRows.map((r) => r.idempotencyKey));

  const skipped: Array<{ candidate_id: string; reason: BulkSendSkipReason }> = [];
  const toInsert: Array<{
    candidateId: string;
    campaignId: string;
    templateType: TemplateType;
    scheduledFor: Date;
    idempotencyKey: string;
  }> = [];

  for (const cid of ids) {
    const c = byId.get(cid);
    if (!c) {
      skipped.push({ candidate_id: cid, reason: "candidate_not_found" });
      continue;
    }
    if (!c.email || !c.email.trim()) {
      skipped.push({ candidate_id: cid, reason: "no_email" });
      continue;
    }

    if (template_type === "stage1") {
      // v2.2: HR pre-filters good-fit candidates BEFORE import (via the LinkedIn
      // good-fit exporter userscript + match script), so any candidate sitting
      // in this campaign is already an approved good-fit. We trust the import
      // pipeline and only gate on email presence (already checked above).
    } else {
      if (c.interviewVerdict !== "call_interview") {
        skipped.push({
          candidate_id: cid,
          reason: "verdict_not_call_interview",
        });
        continue;
      }
      if (c.stage !== "evaluated_screen2") {
        skipped.push({ candidate_id: cid, reason: "wrong_stage" });
        continue;
      }
    }

    const idemKey = idemKeyFor(cid);
    if (existingKeys.has(idemKey)) {
      skipped.push({ candidate_id: cid, reason: "already_sent" });
      continue;
    }

    toInsert.push({
      candidateId: cid,
      campaignId,
      templateType: template_type,
      scheduledFor: new Date(),
      idempotencyKey: idemKey,
    });
  }

  // Bulk insert in one statement when there's anything to enqueue.
  // onConflictDoNothing on idempotency_key shields against any race where a
  // concurrent request beat us to the same key — those rows simply skip.
  let queued = 0;
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(emailQueue)
      .values(toInsert)
      .onConflictDoNothing({ target: emailQueue.idempotencyKey })
      .returning({ id: emailQueue.id, candidateId: emailQueue.candidateId });
    queued = inserted.length;

    // Audit one row per queued candidate.
    for (const row of inserted) {
      await logAudit({
        actor: session.actor,
        action: "email.queued.bulk",
        entityType: "candidate",
        entityId: row.candidateId,
        metadata: {
          campaign_id: campaignId,
          template_type,
          queue_id: row.id,
        },
      });
    }

    // Any toInsert candidates that did NOT come back from the insert lost a
    // race — flip them into the skipped list with already_sent so the caller
    // sees a complete accounting.
    if (inserted.length < toInsert.length) {
      const insertedCids = new Set(inserted.map((r) => r.candidateId));
      for (const r of toInsert) {
        if (!insertedCids.has(r.candidateId)) {
          skipped.push({
            candidate_id: r.candidateId,
            reason: "already_sent",
          });
        }
      }
    }
  }

  // Roll-up audit for the whole bulk action.
  await logAudit({
    actor: session.actor,
    action: "email.queued.bulk.summary",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      template_type,
      requested: ids.length,
      queued,
      skipped_count: skipped.length,
    },
  });

  const body: BulkSendResult = { queued, skipped };
  return NextResponse.json(body);
});
