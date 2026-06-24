import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.notFound("Campaign");

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return ERR.validation({ reason: "missing file" });

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) return ERR.validation({ reason: "empty workbook" });

  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });
  if (rows.length === 0) return ERR.validation({ reason: "sheet has no rows" });

  const headers = Object.keys(rows[0]!);
  const emailCol = headers.find((h) => /email/i.test(h)) ?? null;
  const nameCol = headers.find((h) => /name/i.test(h)) ?? null;

  if (!emailCol && !nameCol) {
    return ERR.validation({ reason: "Sheet must have at least an Email or Name column" });
  }

  // Build lookup entries from the sheet
  const sheetEntries = rows
    .map((row) => ({
      email: emailCol ? norm(row[emailCol] ?? "") : "",
      name: nameCol ? norm(row[nameCol] ?? "") : "",
    }))
    .filter((e) => e.email || e.name);

  // Load all existing candidates for this campaign
  const allCandidates = await db
    .select()
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId));

  const byEmail = new Map<string, (typeof allCandidates)[0]>();
  const byName = new Map<string, (typeof allCandidates)[0]>();
  for (const c of allCandidates) {
    if (c.email) byEmail.set(norm(c.email), c);
    byName.set(norm(c.fullName), c);
  }

  const matchedIds: string[] = [];
  const unmatched: Array<{ name: string; email: string; reason: string }> = [];

  for (const entry of sheetEntries) {
    const candidate =
      (entry.email ? byEmail.get(entry.email) : undefined) ??
      (entry.name ? byName.get(entry.name) : undefined) ??
      null;

    if (!candidate) {
      unmatched.push({ name: entry.name, email: entry.email, reason: "no_match" });
    } else {
      matchedIds.push(candidate.id);
    }
  }

  let updated = 0;
  if (matchedIds.length > 0) {
    const result = await db
      .update(candidates)
      .set({ stage: "stage2", updatedAt: new Date() })
      .where(
        and(
          eq(candidates.campaignId, campaignId),
          inArray(candidates.id, matchedIds),
        ),
      )
      .returning({ id: candidates.id });
    updated = result.length;

    await logAudit({
      actor: session.actor,
      action: "stage2.import",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { matched: matchedIds.length, updated, unmatched: unmatched.length },
    });
  }

  return NextResponse.json({ matched: matchedIds.length, updated, unmatched });
});
