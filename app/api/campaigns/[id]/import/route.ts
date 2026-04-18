import { NextResponse, type NextRequest } from "next/server";
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

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  google_sheet_url: z.string().url(),
  column_mapping: z.object({
    full_name: z.string().min(1),
    role: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    linkedin_url: z.string().min(1).optional(),
    headline: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    application_date: z.string().min(1).optional(),
  }),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function norm(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return ERR.validation({ reason: "invalid JSON body" });
  }
  if (!parsed.success) return ERR.validation({ issues: parsed.error.flatten() });

  const { google_sheet_url, column_mapping } = parsed.data;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.campaignNotFound();

  let sheet;
  try {
    sheet = await fetchSheetRows({ url: google_sheet_url, mapping: column_mapping });
  } catch (err) {
    if (err instanceof SheetUnreachableError) return ERR.sheetUnreachable(err.message);
    if (err instanceof SheetUpstreamError) return ERR.sheetUpstream(err.message);
    return ERR.sheetUpstream(err instanceof Error ? err.message : "unknown sheet error");
  }

  const errors: ImportError[] = [...sheet.errors];
  const validRows: SheetRow[] = [];

  for (const row of sheet.rows) {
    const fullName = norm(row.full_name);
    if (!fullName) {
      errors.push({ row: row.row_number, reason: "missing full_name" });
      continue;
    }
    const email = norm(row.email);
    if (email && !EMAIL_RE.test(email)) {
      errors.push({ row: row.row_number, reason: `invalid email "${email}"` });
      continue;
    }
    validRows.push(row);
  }

  const seenEmails = new Set<string>();
  const deduped: SheetRow[] = [];
  for (const row of validRows) {
    const email = norm(row.email)?.toLowerCase();
    if (email) {
      if (seenEmails.has(email)) {
        errors.push({ row: row.row_number, reason: "duplicate email in batch" });
        continue;
      }
      seenEmails.add(email);
    }
    deduped.push(row);
  }

  const incomingEmails = deduped
    .map((r) => norm(r.email))
    .filter((e): e is string => !!e);

  const existingEmailSet = new Set<string>();
  if (incomingEmails.length > 0) {
    const existing = await db
      .select({ email: candidates.email })
      .from(candidates)
      .where(
        and(eq(candidates.campaignId, campaignId), inArray(candidates.email, incomingEmails)),
      );
    for (const r of existing) {
      if (r.email) existingEmailSet.add(r.email.toLowerCase());
    }
  }

  const toInsert: SheetRow[] = [];
  for (const row of deduped) {
    const email = norm(row.email)?.toLowerCase();
    if (email && existingEmailSet.has(email)) {
      errors.push({ row: row.row_number, reason: "duplicate email in campaign" });
      continue;
    }
    toInsert.push(row);
  }

  let insertedIds: string[] = [];
  if (toInsert.length > 0) {
    const rows = await db
      .insert(candidates)
      .values(
        toInsert.map((row) => ({
          fullName: norm(row.full_name)!,
          email: norm(row.email),
          linkedinUrl: norm(row.linkedin_url),
          headline: norm(row.raw["headline"] ?? row.raw["Headline"] ?? null),
          location: norm(row.raw["location"] ?? row.raw["Location"] ?? null),
          applicationDate: norm(
            row.raw["application_date"] ??
              row.raw["Application Date"] ??
              row.raw["application date"] ??
              null,
          ),
          campaignId,
          googleSheetRow: row.row_number,
        })),
      )
      .returning({ id: candidates.id });
    insertedIds = rows.map((r) => r.id);
  }

  await logAudit({
    actor: session.actor,
    action: "candidates.imported",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      sheet_url: google_sheet_url,
      sheet_title: sheet.sheet_title,
      column_mapping,
      imported: insertedIds.length,
      skipped: errors.length,
      errors,
    },
  });

  const body: ImportResult = {
    imported: insertedIds.length,
    skipped: errors.length,
    errors,
  };
  return NextResponse.json(body);
});
