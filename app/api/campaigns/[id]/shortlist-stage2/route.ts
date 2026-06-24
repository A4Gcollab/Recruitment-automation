import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1).max(500),
});

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.notFound("Campaign");

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return ERR.validation({ issues: parsed.error.flatten() });

  const { candidate_ids } = parsed.data;
  const ids = Array.from(new Set(candidate_ids));

  const updated = await db
    .update(candidates)
    .set({ stage: "stage2", updatedAt: new Date() })
    .where(
      and(
        eq(candidates.campaignId, campaignId),
        inArray(candidates.id, ids),
      ),
    )
    .returning({ id: candidates.id });

  await logAudit({
    actor: session.actor,
    action: "stage2.shortlist",
    entityType: "campaign",
    entityId: campaignId,
    metadata: { shortlisted: updated.length, requested: ids.length },
  });

  return NextResponse.json({ shortlisted: updated.length });
});
