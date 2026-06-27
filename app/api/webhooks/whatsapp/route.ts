import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull, ne, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import { candidates, whatsappMessages } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — Meta webhook verification (called once during setup)
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST — incoming webhook events (status updates + inbound messages)
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySignature(req, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Process each entry/change
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;

      // Handle status updates (sent → delivered → read)
      for (const status of value.statuses ?? []) {
        await handleStatusUpdate(status);
      }

      // Handle inbound messages (replies from candidates)
      for (const message of value.messages ?? []) {
        const contact = value.contacts?.find((c: Contact) => c.wa_id === message.from);
        await handleInboundMessage(message, contact);
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function handleStatusUpdate(status: StatusUpdate) {
  const waMessageId = status.id;
  const newStatus = status.status; // sent | delivered | read | failed

  // Update the message log
  await db
    .update(whatsappMessages)
    .set({ status: newStatus })
    .where(eq(whatsappMessages.waMessageId, waMessageId));

  // Update the candidate's wa_status to the latest
  const [msg] = await db
    .select({ candidateId: whatsappMessages.candidateId })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.waMessageId, waMessageId))
    .limit(1);

  if (msg) {
    // Never overwrite a reply status with a delivery status.
    // Reply statuses take permanent priority over sent/delivered/read.
    const REPLY_STATUSES = ["replied", "stage1_replied", "stage2_replied"];
    await db
      .update(candidates)
      .set({ waStatus: newStatus, updatedAt: new Date() })
      .where(
        and(
          eq(candidates.id, msg.candidateId),
          or(isNull(candidates.waStatus), notInArray(candidates.waStatus, REPLY_STATUSES)),
        ),
      );
  }
}

async function handleInboundMessage(message: InboundMessage, contact?: Contact) {
  const senderPhone = message.from;
  const messageBody =
    message.type === "text" ? message.text?.body ?? "" : `[${message.type}]`;

  // Find the candidate by phone number.
  // DB may store phone in any of: "9340749064", "919340749064", "+919340749064"
  // Meta sends senderPhone as "919340749064" (no +, with country code)
  const tenDigit = senderPhone.startsWith("91") ? senderPhone.slice(2) : senderPhone;
  const phonesToTry = [
    senderPhone,           // "919340749064"
    `+${senderPhone}`,     // "+919340749064"
    tenDigit,              // "9340749064"
    `+91${tenDigit}`,      // "+919340749064" (same as above via different path)
  ];

  let candidate: typeof candidates.$inferSelect | undefined;
  for (const phone of phonesToTry) {
    const rows = await db
      .select()
      .from(candidates)
      .where(eq(candidates.phone, phone))
      .limit(1);
    if (rows[0]) { candidate = rows[0]; break; }
  }

  if (!candidate) return;

  // Log the inbound message
  await db.insert(whatsappMessages).values({
    candidateId: candidate.id,
    campaignId: candidate.campaignId,
    direction: "inbound",
    waMessageId: message.id,
    body: messageBody,
    status: "received",
  });

  // Determine which stage the reply belongs to based on candidate's current stage.
  // Stage 2 stages: candidate was already invited for interview.
  const STAGE2_STAGES = new Set([
    "stage2", "stage2_sent", "evaluated_screen2",
    "interview_link_sent", "confirmed", "interview_confirmed",
  ]);
  const waReplyStatus = STAGE2_STAGES.has(candidate.stage) ? "stage2_replied" : "stage1_replied";

  await db
    .update(candidates)
    .set({
      waStatus: waReplyStatus,
      waLastReply: messageBody,
      waLastReplyAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidate.id));

  await logAudit({
    actor: "system:whatsapp-webhook",
    action: "whatsapp.reply_received",
    entityType: "candidate",
    entityId: candidate.id,
    metadata: {
      wa_message_id: message.id,
      sender_phone: senderPhone,
      sender_name: contact?.profile?.name,
      body_preview: messageBody.slice(0, 100),
    },
  });
}

function verifySignature(req: NextRequest, rawBody: string): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // skip verification in dev if no secret configured

  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const expectedSig =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig),
  );
}

// Meta webhook type definitions
type WebhookPayload = {
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        statuses?: StatusUpdate[];
        messages?: InboundMessage[];
        contacts?: Contact[];
      };
    }>;
  }>;
};

type StatusUpdate = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
};

type InboundMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: "text" | "image" | "audio" | "video" | "document" | "location" | "contacts" | "button" | "reaction";
  text?: { body: string };
};

type Contact = {
  wa_id: string;
  profile: { name: string };
};
