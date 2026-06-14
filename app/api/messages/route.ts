import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { withAuth } from "@/lib/api/withAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MessageInboxItem = {
  id: string;
  full_name: string;
  phone: string | null;
  wa_last_reply: string | null;
  wa_last_reply_at: string | null;
  wa_last_sent_at: string | null;
  stage: string;
  campaign_id: string;
  campaign_name: string;
};

export const GET = withAuth(async () => {
  const rows = await db
    .select({
      id: candidates.id,
      fullName: candidates.fullName,
      phone: candidates.phone,
      waLastReply: candidates.waLastReply,
      waLastReplyAt: candidates.waLastReplyAt,
      waLastSentAt: candidates.waLastSentAt,
      stage: candidates.stage,
      campaignId: candidates.campaignId,
      campaignName: campaigns.roleName,
    })
    .from(candidates)
    .innerJoin(campaigns, eq(candidates.campaignId, campaigns.id))
    .where(eq(candidates.waStatus, "replied"))
    .orderBy(desc(candidates.waLastReplyAt))
    .limit(500);

  const items: MessageInboxItem[] = rows.map((r) => ({
    id: r.id,
    full_name: r.fullName,
    phone: r.phone,
    wa_last_reply: r.waLastReply,
    wa_last_reply_at: r.waLastReplyAt ? r.waLastReplyAt.toISOString() : null,
    wa_last_sent_at: r.waLastSentAt ? r.waLastSentAt.toISOString() : null,
    stage: r.stage,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
  }));

  return NextResponse.json({ items, total: items.length });
});
