import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import type { SheetRow } from "@/lib/sheets/fetchRows";
import type { ImportError, ImportResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const mappingSchema = z.object({
  full_name: z.string().min(1),
  role: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  linkedin_url: z.string().min(1).optional(),
  headline: z.string().min(1).optional(),
  current_title: z.string().min(1).optional(),
  current_company: z.string().min(1).optional(),
  school: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  application_date: z.string().min(1).optional(),
  resume_url: z.string().min(1).optional(),
  applicantsync_score: z.string().min(1).optional(),
});

type ColumnMapping = z.infer<typeof mappingSchema>;

/** Build the linkedin_data bag: every cell in row.raw whose header is NOT
 *  one of the columns the typed mapping already consumed. Keys are verbatim
 *  sheet headers; values are trimmed strings. Empty/whitespace-only cells
 *  are dropped so the bag stays compact. Default for a row with no extras: {}. */
function buildLinkedinData(
  row: { raw: Record<string, string> },
  mapping: Record<string, string | undefined>,
): Record<string, string> {
  const consumedHeaders = new Set<string>();
  for (const header of Object.values(mapping)) {
    if (typeof header === "string" && header.length > 0) {
      consumedHeaders.add(header);
    }
  }
  const bag: Record<string, string> = {};
  for (const [header, value] of Object.entries(row.raw)) {
    if (consumedHeaders.has(header)) continue;
    const v = String(value ?? "").trim();
    if (v === "") continue;
    bag[header] = v;
  }
  return bag;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function norm(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function extractCell(
  raw: Record<string, string>,
  headerName: string | undefined,
): string | null {
  if (!headerName) return null;
  let val = raw[headerName];
  if (val === undefined || val === null) {
    const lower = headerName.toLowerCase();
    for (const [key, v] of Object.entries(raw)) {
      if (key.toLowerCase() === lower) { val = v; break; }
    }
  }
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed === "" ? null : trimmed;
}

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  // Parse multipart form data
  let columnMapping: ColumnMapping;
  let fileBuffer: Buffer;
  let fileName = "upload.xlsx";

  try {
    const formData = await req.formData();
    const fileField = formData.get("file");
    const mappingField = formData.get("column_mapping");

    if (!(fileField instanceof Blob)) {
      return ERR.validation({ reason: "file is required" });
    }
    if (typeof mappingField !== "string") {
      return ERR.validation({ reason: "column_mapping is required" });
    }

    fileBuffer = Buffer.from(await fileField.arrayBuffer());
    if ("name" in fileField) fileName = (fileField as File).name;

    const mappingParsed = mappingSchema.safeParse(JSON.parse(mappingField));
    if (!mappingParsed.success) {
      return ERR.validation({ issues: mappingParsed.error.flatten() });
    }
    columnMapping = mappingParsed.data;
  } catch (err) {
    return ERR.validation({
      reason: err instanceof Error ? err.message : "invalid request",
    });
  }

  console.log("[import] file:", fileName, "column_mapping:", JSON.stringify(columnMapping));

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.campaignNotFound();

  // Parse xlsx
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer" });
  } catch (err) {
    return ERR.validation({
      reason: `Could not parse Excel file: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return ERR.validation({ reason: "Excel file has no sheets" });
  }
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: false, // format dates etc. as strings
  });

  console.log("[import] excel rows:", rawRows.length, "sheet:", sheetName);

  // Build SheetRow[] from raw xlsx data
  const errors: ImportError[] = [];
  const rows: SheetRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const rowNumber = i + 2; // row 1 = header, data starts at row 2

    const raw: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawRow)) {
      raw[key] = String(val ?? "").trim();
    }

    const full_name = extractCell(raw, columnMapping.full_name);
    const email = extractCell(raw, columnMapping.email);
    const phone = extractCell(raw, columnMapping.phone);
    const linkedin_url = extractCell(raw, columnMapping.linkedin_url);
    const role = extractCell(raw, columnMapping.role);
    const headline = extractCell(raw, columnMapping.headline);
    const current_title = extractCell(raw, columnMapping.current_title);
    const current_company = extractCell(raw, columnMapping.current_company);
    const school = extractCell(raw, columnMapping.school);
    const location = extractCell(raw, columnMapping.location);
    const application_date = extractCell(raw, columnMapping.application_date);
    const resume_url = extractCell(raw, columnMapping.resume_url);
    const applicantsync_score = extractCell(raw, columnMapping.applicantsync_score);

    // Skip completely empty rows
    if (!full_name && !email && !linkedin_url) continue;

    rows.push({
      row_number: rowNumber,
      full_name, email, phone, linkedin_url, role,
      headline, current_title, current_company, school, location,
      application_date, resume_url, applicantsync_score, raw,
    });
  }

  if (rows.length > 0) {
    console.log("[import] first row sample:", JSON.stringify(rows[0]));
  }

  const validRows: SheetRow[] = [];

  for (const row of rows) {
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
    const inserted = await db
      .insert(candidates)
      .values(
        toInsert.map((row) => ({
          fullName: norm(row.full_name)!,
          email: norm(row.email),
          linkedinUrl: norm(row.linkedin_url),
          headline: norm(row.headline),
          location: norm(row.location),
          applicationDate: norm(row.application_date),
          phone: norm(row.phone),
          currentTitle: norm(row.current_title),
          currentCompany: norm(row.current_company),
          school: norm(row.school),
          resumeUrl: norm(row.resume_url),
          applicantsyncScore: norm(row.applicantsync_score),
          linkedinData: buildLinkedinData(row, columnMapping),
          campaignId,
          googleSheetRow: row.row_number,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: candidates.id });
    insertedIds = inserted.map((r) => r.id);
  }

  await logAudit({
    actor: session.actor,
    action: "candidates.imported",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      file_name: fileName,
      sheet_name: sheetName,
      column_mapping: columnMapping,
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
  console.log("[import] result:", JSON.stringify({ imported: body.imported, skipped: body.skipped, errors: body.errors.slice(0, 5) }));
  return NextResponse.json(body);
});
