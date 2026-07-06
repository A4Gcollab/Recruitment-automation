import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receives LinkedIn screening Q&A captured by the Chrome extension.
// Auth: LINKEDIN_SYNC_KEY Bearer token (same key the extension uses for /campaigns).
// Behaviour per applicant:
//   - Match by linkedin_data->>'linkedin_applicant_id' within the campaign.
//   - If found  → merge screening_qa into their linkedin_data (non-destructive).
//   - If not found → create a new candidate at stage 'imported'.
// No existing candidate fields (stage, email, phone…) are ever overwritten.

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const bodySchema = z.object({
  campaign_id: z.string().uuid(),
  applicants: z
    .array(
      z.object({
        applicant_id: z.string().min(1),
        name: z.string().min(1),
        qa: z.record(z.string(), z.string()),
      }),
    )
    .min(1)
    .max(500),
});

export async function POST(req: NextRequest) {
  const key = process.env.LINKEDIN_SYNC_KEY;
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!key || auth !== key) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid or missing LINKEDIN_SYNC_KEY" } },
      { status: 401, headers: corsHeaders() },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid JSON body" } },
      { status: 400, headers: corsHeaders() },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid payload", details: parsed.error.flatten() } },
      { status: 400, headers: corsHeaders() },
    );
  }

  const { campaign_id, applicants } = parsed.data;

  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaign_id));
  if (!campaign) {
    return NextResponse.json(
      { error: { code: "campaign_not_found", message: "Campaign not found" } },
      { status: 404, headers: corsHeaders() },
    );
  }

  let created = 0;
  let updated = 0;

  for (const applicant of applicants) {
    // linkedinData column is typed Record<string,string> but the JSONB field
    // accepts any JSON — cast to satisfy Drizzle's inferred type.
    const newLinkedinData = {
      linkedin_applicant_id: applicant.applicant_id,
      screening_qa: applicant.qa,
    } as unknown as Record<string, string>;

    // Look for an existing candidate matched by linkedin_applicant_id in this campaign
    const [existing] = await db
      .select({ id: candidates.id, linkedinData: candidates.linkedinData })
      .from(candidates)
      .where(
        and(
          eq(candidates.campaignId, campaign_id),
          sql`${candidates.linkedinData}->>'linkedin_applicant_id' = ${applicant.applicant_id}`,
        ),
      )
      .limit(1);

    if (existing) {
      // Merge — keep all existing linkedin_data fields, overwrite only screening_qa
      const merged = { ...existing.linkedinData, ...newLinkedinData };
      await db
        .update(candidates)
        .set({ linkedinData: merged, updatedAt: new Date() })
        .where(eq(candidates.id, existing.id));

      await logAudit({
        actor: "system:linkedin-extension",
        action: "candidate.screening_qa_updated",
        entityType: "candidate",
        entityId: existing.id,
        metadata: { campaign_id, applicant_id: applicant.applicant_id, qa_count: Object.keys(applicant.qa).length },
      });

      updated++;
    } else {
      // Create new candidate — only fields we actually have from LinkedIn
      const [inserted] = await db
        .insert(candidates)
        .values({
          fullName: applicant.name,
          campaignId: campaign_id,
          stage: "imported",
          linkedinData: newLinkedinData,
        })
        .returning({ id: candidates.id });

      await logAudit({
        actor: "system:linkedin-extension",
        action: "candidate.created_from_linkedin",
        entityType: "candidate",
        entityId: inserted!.id,
        metadata: { campaign_id, applicant_id: applicant.applicant_id, qa_count: Object.keys(applicant.qa).length },
      });

      created++;
    }
  }

  return NextResponse.json({ created, updated }, { headers: corsHeaders() });
}
