import { NextResponse, type NextRequest } from "next/server";
import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailQueue, whatsappQueue, candidates } from "@/db/schema";
import { withAuth } from "@/lib/api/withAuth";
import { verifyConnection } from "@/lib/nodemailer/transport";
import { isWhatsAppConfigured } from "@/lib/whatsapp/sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function istNow() {
  const now = new Date();
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(now.getTime() + istOffsetMs);
  return {
    utc: now.toISOString(),
    ist: ist.toISOString().replace("Z", "+05:30"),
    ist_hour: ist.getUTCHours(),
  };
}

export const GET = withAuth(async (_req: NextRequest) => {
  const time = istNow();

  // ── Email queue ──────────────────────────────────────────────────────────
  const emailStatusRows = await db
    .select({ status: emailQueue.status, count: sql<number>`count(*)::int` })
    .from(emailQueue)
    .groupBy(emailQueue.status);

  const emailFailed = await db
    .select({
      id: emailQueue.id,
      template_type: emailQueue.templateType,
      error_message: emailQueue.errorMessage,
      retry_count: emailQueue.retryCount,
      created_at: emailQueue.createdAt,
      scheduled_for: emailQueue.scheduledFor,
    })
    .from(emailQueue)
    .where(eq(emailQueue.status, "failed"))
    .orderBy(desc(emailQueue.createdAt))
    .limit(10);

  const emailStuck = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailQueue)
    .where(eq(emailQueue.status, "processing"));

  const emailPendingOld = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailQueue)
    .where(
      eq(emailQueue.status, "pending"),
    );

  // ── WhatsApp queue ────────────────────────────────────────────────────────
  const waStatusRows = await db
    .select({ status: whatsappQueue.status, count: sql<number>`count(*)::int` })
    .from(whatsappQueue)
    .groupBy(whatsappQueue.status);

  const waFailed = await db
    .select({
      id: whatsappQueue.id,
      template_name: whatsappQueue.templateName,
      error_message: whatsappQueue.errorMessage,
      retry_count: whatsappQueue.retryCount,
      created_at: whatsappQueue.createdAt,
    })
    .from(whatsappQueue)
    .where(eq(whatsappQueue.status, "failed"))
    .orderBy(desc(whatsappQueue.createdAt))
    .limit(10);

  const waStuck = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(whatsappQueue)
    .where(eq(whatsappQueue.status, "processing"));

  // ── Last sent times ───────────────────────────────────────────────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const emailSentLastHour = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailQueue)
    .where(
      sql`${emailQueue.status} = 'sent' AND ${emailQueue.sentAt} >= ${oneHourAgo}`,
    );

  const waSentLastHour = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(whatsappQueue)
    .where(
      sql`${whatsappQueue.status} = 'sent' AND ${whatsappQueue.sentAt} >= ${oneHourAgo}`,
    );

  // ── Candidate WA status breakdown ────────────────────────────────────────
  const waStatusCandidates = await db
    .select({ wa_status: candidates.waStatus, count: sql<number>`count(*)::int` })
    .from(candidates)
    .groupBy(candidates.waStatus);

  // ── Env health ────────────────────────────────────────────────────────────
  const envChecks = {
    GMAIL_USER: !!process.env.GMAIL_USER,
    GMAIL_APP_PASSWORD: !!process.env.GMAIL_APP_PASSWORD,
    WHATSAPP_PHONE_NUMBER_ID: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN: !!process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    CRON_SECRET: !!process.env.CRON_SECRET,
    DATABASE_URL: !!process.env.DATABASE_URL,
    KILL_SWITCH_EMAIL: process.env.KILL_SWITCH_EMAIL ?? "not set",
    KILL_SWITCH_WHATSAPP: process.env.KILL_SWITCH_WHATSAPP ?? "not set",
    SENDING_WINDOW_START_IST: process.env.SENDING_WINDOW_START_IST ?? "9 (default)",
    SENDING_WINDOW_END_IST: process.env.SENDING_WINDOW_END_IST ?? "18 (default)",
    HOURLY_SEND_CAP: process.env.HOURLY_SEND_CAP ?? "20 (default)",
  };

  // ── Gmail SMTP live check ─────────────────────────────────────────────────
  let gmailSmtpOk: boolean | string = false;
  try {
    gmailSmtpOk = await verifyConnection();
  } catch (e) {
    gmailSmtpOk = e instanceof Error ? e.message : String(e);
  }

  // ── Sending window check ──────────────────────────────────────────────────
  const windowStart = parseInt(process.env.SENDING_WINDOW_START_IST ?? "9", 10);
  const windowEnd = parseInt(process.env.SENDING_WINDOW_END_IST ?? "18", 10);
  const insideWindow = time.ist_hour >= windowStart && time.ist_hour < windowEnd;

  return NextResponse.json({
    generated_at: time,
    sending_window: {
      start_ist: windowStart,
      end_ist: windowEnd,
      currently_inside: insideWindow,
      note: insideWindow ? "✅ inside window" : `⚠️ currently IST hour ${time.ist_hour} — outside ${windowStart}–${windowEnd}`,
    },
    env: envChecks,
    gmail_smtp_connected: gmailSmtpOk,
    whatsapp_configured: isWhatsAppConfigured(),
    email_queue: {
      by_status: emailStatusRows,
      stuck_in_processing: emailStuck[0]?.count ?? 0,
      pending_total: emailPendingOld[0]?.count ?? 0,
      sent_last_hour: emailSentLastHour[0]?.count ?? 0,
      recent_failures: emailFailed,
    },
    whatsapp_queue: {
      by_status: waStatusRows,
      stuck_in_processing: waStuck[0]?.count ?? 0,
      sent_last_hour: waSentLastHour[0]?.count ?? 0,
      recent_failures: waFailed,
    },
    candidate_wa_status_breakdown: waStatusCandidates,
  });
});
