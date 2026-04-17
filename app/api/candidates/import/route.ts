import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import {
  fetchSheetRows,
  SheetUnreachableError,
  SheetUpstreamError,
  type SheetRow,
} from "@/lib/sheets/fetchRows";
import type { ImportError, ImportResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  google_sheet_url: z.string().url(),
  campaign_id: z.string().uuid(),
  column_mapping: z.object({
    full_name: z.string().min(1),
    role: z.string().min(1),
    email: z.string().min(1).optional(),
    linkedin_url: z.string().min(1).optional(),
  }),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalize(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const trimmed = s.trim();
  return trimmed === "" ? null : trimmed;
}

export const POST = withAuth(async (req, _ctx, session) => {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return ERR.validation({ reason: "invalid JSON body" });
  }
  if (!parsed.success) {
    return ERR.validation({ issues: parsed.error.flatten() });
  }
  const { google_sheet_url, campaign_id, column_mapping } = parsed.data;

  const campaign = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaign_id))
    .limit(1);
  if (campaign.length === 0) return ERR.campaignNotFound();

  let sheet;
  try {
    sheet = await fetchSheetRows({
      url: google_sheet_url,
      mapping: column_mapping,
    });
  } catch (err) {
    if (err instanceof SheetUnreachableError) {
      return ERR.sheetUnreachable(err.message);
    }
    if (err instanceof SheetUpstreamError) {
      return ERR.sheetUpstream(err.message);
    }
    console.error("fetchSheetRows threw:", err);
    return ERR.sheetUpstream(err instanceof Error ? err.message : "unknown sheet error");
  }

  const errors: ImportError[] = [...sheet.errors];
  const validRows: SheetRow[] = [];

  for (const row of sheet.rows) {
    const fullName = normalize(row.full_name);
    const role = normalize(row.role);
    if (!fullName) {
      errors.push({ row: row.row_number, reason: "missing full_name" });
      continue;
    }
    if (!role) {
      errors.push({ row: row.row_number, reason: "missing role" });
      continue;
    }
    const email = normalize(row.email);
    if (email && !EMAIL_RE.test(email)) {
      errors.push({ row: row.row_number, reason: `invalid email "${email}"` });
      continue;
    }
    validRows.push(row);
  }

  // De-dupe within the incoming batch by email (first wins).
  const seenEmails = new Set<string>();
  const dedupedRows: SheetRow[] = [];
  for (const row of validRows) {
    const email = normalize(row.email)?.toLowerCase();
    if (email) {
      if (seenEmails.has(email)) {
        errors.push({ row: row.row_number, reason: "duplicate email in upload batch" });
        continue;
      }
      seenEmails.add(email);
    }
    dedupedRows.push(row);
  }

  // Reject any email already present in this campaign.
  const incomingEmails = dedupedRows
    .map((r) => normalize(r.email))
    .filter((e): e is string => !!e);
  const existingEmails =
    incomingEmails.length === 0
      ? []
      : await db
          .select({ email: candidates.email })
          .from(candidates)
          .where(
            and(
              eq(candidates.campaignId, campaign_id),
              inArray(candidates.email, incomingEmails),
            ),
          );
  const existingEmailSet = new Set(
    existingEmails.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e),
  );

  const toInsert: SheetRow[] = [];
  for (const row of dedupedRows) {
    const email = normalize(row.email)?.toLowerCase();
    if (email && existingEmailSet.has(email)) {
      errors.push({ row: row.row_number, reason: "duplicate email in campaign" });
      continue;
    }
    toInsert.push(row);
  }

  let inserted: { id: string; row_number: number }[] = [];
  if (toInsert.length > 0) {
    const inserts = toInsert.map((row) => ({
      fullName: normalize(row.full_name)!,
      email: normalize(row.email),
      linkedinUrl: normalize(row.linkedin_url),
      role: normalize(row.role)!,
      campaignId: campaign_id,
      googleSheetRow: row.row_number,
    }));

    const rows = await db
      .insert(candidates)
      .values(inserts)
      .returning({ id: candidates.id });

    inserted = rows.map((r, i) => ({
      id: r.id,
      row_number: toInsert[i]!.row_number,
    }));
  }

  await logAudit({
    actor: session.actor,
    action: "candidates.imported",
    entityType: "campaign",
    entityId: campaign_id,
    metadata: {
      sheet_url: google_sheet_url,
      sheet_title: sheet.sheet_title,
      header_row: sheet.header_row,
      column_mapping,
      imported: inserted.length,
      skipped: errors.length,
      inserted_ids: inserted.map((i) => i.id),
      errors,
    },
  });

  const body: ImportResult = {
    imported: inserted.length,
    skipped: errors.length,
    errors,
  };
  return NextResponse.json(body);
});
