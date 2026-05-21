import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates, formResponses } from "@/db/schema";
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

// CONTRACTS §2.12 — rows = candidates with form responses, including those
// already evaluated/rejected at Screen-2 so HR can re-export historically.
const ELIGIBLE_STAGES = [
  "form_submitted",
  "evaluated_screen2",
  "rejected_screen2",
  "interview_link_sent",
];

const FIXED_COLUMNS = ["name", "email", "linkedin_url", "verdict", "reason"] as const;

export const GET = withAuth<Ctx>(async (_req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.notFound("Campaign");

  // 1. Candidates in eligible stages for this campaign.
  const eligibleCandidates = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.campaignId, campaignId),
        inArray(candidates.stage, ELIGIBLE_STAGES),
      ),
    );

  // 2. Their form responses — latest per candidate.
  // For the v0.2 MVP, NGO scale stays well under any threshold where this
  // becomes expensive. Pull all responses for this campaign, then group in JS.
  const allResponses =
    eligibleCandidates.length === 0
      ? []
      : await db
          .select()
          .from(formResponses)
          .where(eq(formResponses.campaignId, campaignId))
          .orderBy(desc(formResponses.submittedAt));

  // Latest form_response per candidate.
  const latestByCandidate = new Map<string, (typeof allResponses)[number]>();
  for (const r of allResponses) {
    if (!latestByCandidate.has(r.candidateId)) {
      latestByCandidate.set(r.candidateId, r);
    }
  }

  // 3. Filter eligible candidates to those who actually have a response.
  const rowsWithResponses = eligibleCandidates
    .filter((c) => latestByCandidate.has(c.id))
    .map((c) => ({ candidate: c, response: latestByCandidate.get(c.id)! }));

  // 4. Union of form-response question keys across the campaign.
  const dynamicKeySet = new Set<string>();
  for (const { response } of rowsWithResponses) {
    const bag = (response.responses ?? {}) as Record<string, string>;
    for (const k of Object.keys(bag)) dynamicKeySet.add(k);
  }
  const dynamicKeys = Array.from(dynamicKeySet);

  // 5. Build XLSX.
  const header: string[] = [
    ...FIXED_COLUMNS,
    ...dynamicKeys,
    "interview_verdict",
    "interview_reason",
  ];

  const dataRows: (string | number | null)[][] = rowsWithResponses.map(
    ({ candidate: c, response }) => {
      const bag = (response.responses ?? {}) as Record<string, string>;
      return [
        c.fullName,
        c.email,
        c.linkedinUrl,
        c.verdict ?? "",
        c.reason ?? "",
        ...dynamicKeys.map((k) => bag[k] ?? ""),
        c.interviewVerdict ?? "",
        c.interviewReason ?? "",
      ];
    },
  );

  const buf = buildXlsxBuffer({
    sheetName: "responses",
    rows: [header, ...dataRows],
  });

  await logAudit({
    actor: session.actor,
    action: "responses.exported",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      row_count: rowsWithResponses.length,
      dynamic_columns: dynamicKeys,
      kind: "screen2",
    },
  });

  const filename = `responses-${slugify(campaign.roleName)}-${ymd()}.xlsx`;
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
