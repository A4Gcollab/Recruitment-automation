import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessages, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req: NextRequest, ctx) => {
  const { id: candidateId } = await ctx.params;

  const [candidate] = await db
    .select({ id: candidates.id, waLastReplyAt: candidates.waLastReplyAt })
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  if (!candidate) return ERR.candidateNotFound();

  const messages = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.candidateId, candidateId))
    .orderBy(asc(whatsappMessages.createdAt));

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const windowOpen =
    candidate.waLastReplyAt &&
    Date.now() - new Date(candidate.waLastReplyAt).getTime() < TWENTY_FOUR_HOURS_MS;

  const windowExpiresAt = candidate.waLastReplyAt
    ? new Date(new Date(candidate.waLastReplyAt).getTime() + TWENTY_FOUR_HOURS_MS).toISOString()
    : null;

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      wa_message_id: m.waMessageId,
      template_name: m.templateName,
      body: m.body,
      status: m.status,
      created_at: m.createdAt.toISOString(),
    })),
    window_open: !!windowOpen,
    window_expires_at: windowExpiresAt,
  });
});
