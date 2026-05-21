import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";
import {
  buildXlsxBuffer,
  slugify,
  XLSX_CONTENT_TYPE,
  ymd,
} from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// CONTRACTS §2.8 — fixed columns first, then union of linkedin_data keys
// across the campaign (so each role's screening Qs show up as their own cols),
// then empty verdict + reason columns for ChatGPT to fill.
const FIXED_COLUMNS = [
  "name",
  "email",
  "linkedin_url",
  "phone",
  "current_title",
  "current_company",
  "school",
  "location",
  "applicantsync_score",
  "resume_url",
] as const;

export const GET = withAuth<Ctx>(async (_req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.notFound("Campaign");

  // All candidates in this campaign — no stage filter (Sushma evaluates whatever landed).
  const rows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId))
    .orderBy(asc(candidates.createdAt));

  // Union of linkedin_data keys across the campaign.
  const dynamicKeySet = new Set<string>();
  for (const r of rows) {
    const bag = (r.linkedinData ?? {}) as Record<string, string>;
    for (const k of Object.keys(bag)) dynamicKeySet.add(k);
  }
  const dynamicKeys = Array.from(dynamicKeySet).sort();

  // Build header row + data rows.
  const header: string[] = [
    ...FIXED_COLUMNS,
    ...dynamicKeys,
    "verdict",
    "reason",
  ];

  const dataRows: (string | number | null)[][] = rows.map((r) => {
    const bag = (r.linkedinData ?? {}) as Record<string, string>;
    return [
      r.fullName,
      r.email,
      r.linkedinUrl,
      r.phone,
      r.currentTitle,
      r.currentCompany,
      r.school,
      r.location,
      r.applicantsyncScore,
      r.resumeUrl,
      ...dynamicKeys.map((k) => bag[k] ?? ""),
      r.verdict ?? "",
      r.reason ?? "",
    ];
  });

  const buf = buildXlsxBuffer({
    sheetName: "candidates",
    rows: [header, ...dataRows],
  });

  await logAudit({
    actor: session.actor,
    action: "candidates.exported",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      row_count: rows.length,
      dynamic_columns: dynamicKeys,
      kind: "screen1",
    },
  });

  const filename = `candidates-${slugify(campaign.roleName)}-${ymd()}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "no-store",
    },
  });
});
