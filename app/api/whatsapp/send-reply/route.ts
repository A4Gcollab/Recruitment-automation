import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { candidates, whatsappMessages } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { sendWhatsAppText } from "@/lib/whatsapp/sender";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  candidate_id: z.string().uuid(),
  message: z.string().min(1).max(4096),
});

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
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

  const { candidate_id, message } = parsed.data;

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidate_id));
  if (!candidate) return ERR.candidateNotFound();
  if (!candidate.phone) {
    return ERR.validation({ reason: "Candidate has no phone number" });
  }

  // Check 24-hour window: candidate must have replied within last 24h
  const windowOpen =
    candidate.waLastReplyAt &&
    Date.now() - new Date(candidate.waLastReplyAt).getTime() < TWENTY_FOUR_HOURS_MS;

  if (!windowOpen) {
    return NextResponse.json(
      {
        error: {
          code: "window_expired",
          message: "24-hour reply window expired. Use a template message instead.",
          details: {
            last_reply_at: candidate.waLastReplyAt,
            window_expired: true,
          },
        },
      },
      { status: 400 },
    );
  }

  const result = await sendWhatsAppText({
    to: candidate.phone,
    text: message,
  });

  if (!result.sent) {
    return NextResponse.json(
      { error: { code: "send_failed", message: result.error } },
      { status: 502 },
    );
  }

  await db.insert(whatsappMessages).values({
    candidateId: candidate.id,
    campaignId: candidate.campaignId,
    direction: "outbound",
    waMessageId: result.messageId,
    body: message,
    status: "sent",
  });

  await logAudit({
    actor: session.actor,
    action: "whatsapp.reply_sent",
    entityType: "candidate",
    entityId: candidate.id,
    metadata: { wa_message_id: result.messageId, body_preview: message.slice(0, 100) },
  });

  return NextResponse.json({ sent: true, message_id: result.messageId });
});
