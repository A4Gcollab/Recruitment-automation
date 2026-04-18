import "server-only";
import { gte, sql, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailQueue } from "@/db/schema";
import { getTransport, getSenderAddress } from "@/lib/nodemailer/transport";

export type SendResult =
  | { sent: true; messageId: string }
  | { sent: false; queued: true; reason: string }
  | { sent: false; queued: false; error: string };

function isWithinSendWindow(): boolean {
  const start = parseInt(process.env.SENDING_WINDOW_START_IST ?? "9", 10);
  const end = parseInt(process.env.SENDING_WINDOW_END_IST ?? "18", 10);
  const now = new Date();
  // IST is UTC+5:30
  const istMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 30;
  const istHour = Math.floor((istMinutes % (24 * 60)) / 60);
  return istHour >= start && istHour < end;
}

async function hourlySentCount(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailQueue)
    .where(and(eq(emailQueue.status, "sent"), gte(emailQueue.sentAt, oneHourAgo)));
  return row?.count ?? 0;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  if (process.env.KILL_SWITCH_EMAIL === "true") {
    return { sent: false, queued: false, error: "Kill switch active" };
  }

  if (!isWithinSendWindow()) {
    return { sent: false, queued: true, reason: "Outside IST sending window" };
  }

  const cap = parseInt(process.env.HOURLY_SEND_CAP ?? "20", 10);
  const sent = await hourlySentCount();
  if (sent >= cap) {
    return { sent: false, queued: true, reason: `Hourly cap reached (${sent}/${cap})` };
  }

  try {
    const transporter = getTransport();
    const info = await transporter.sendMail({
      from: getSenderAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    return { sent: false, queued: false, error: err instanceof Error ? err.message : String(err) };
  }
}
