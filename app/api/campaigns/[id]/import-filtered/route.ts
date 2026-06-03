import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { logAudit } from "@/lib/audit";
import { findHeader, parseXlsxBuffer } from "@/lib/xlsx";
import type { ImportFilteredResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NAME_HEADERS = ["name", "full name", "full_name", "candidate name", "applicant name"];
const EMAIL_HEADERS = ["email", "email address", "e-mail"];
const PHONE_HEADERS = ["phone", "phone number", "mobile"];
const LINKEDIN_HEADERS = ["linkedin url", "linkedin_url", "linkedin", "profile url"];
const TITLE_HEADERS = ["title", "current title", "job title"];
const COMPANY_HEADERS = ["company", "current company", "employer"];
const SCHOOL_HEADERS = ["school", "university", "college"];
const LOCATION_HEADERS = ["location", "city"];
const APPLIED_HEADERS = ["applied date", "application date", "applied"];
const RESUME_HEADERS = ["resume url", "resume_url", "resume", "cv url"];
const SCORE_HEADERS = ["screening score", "score", "applicantsync score"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.+/g, ""); // ignore trailing/internal periods like "Siddhant K."
}

function normCell(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

async function fileToBuffer(blob: Blob): Promise<Buffer> {
  const ab = await blob.arrayBuffer();
  return Buffer.from(ab);
}

export const POST = withAuth<Ctx>(async (req: NextRequest, ctx, session) => {
  const { id: campaignId } = await ctx.params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  if (!campaign) return ERR.campaignNotFound();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return ERR.validation({ reason: "invalid multipart body" });
  }
  const goodfitEntry = form.get("goodfit_file");
  const dataEntry = form.get("data_file");
  if (!(goodfitEntry instanceof Blob) || !(dataEntry instanceof Blob)) {
    return ERR.validation({
      reason: "both goodfit_file and data_file (CSV or XLSX) are required",
    });
  }

  // Parse both files. SheetJS auto-detects CSV vs XLSX from the buffer header.
  let goodfit: ReturnType<typeof parseXlsxBuffer>;
  let dataSheet: ReturnType<typeof parseXlsxBuffer>;
  try {
    goodfit = parseXlsxBuffer(await fileToBuffer(goodfitEntry));
    dataSheet = parseXlsxBuffer(await fileToBuffer(dataEntry));
  } catch (err) {
    return ERR.validation({
      reason: `could not parse uploaded file: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Locate Name column in both files
  const goodfitNameCol = findHeader(goodfit.headers, NAME_HEADERS);
  const dataNameCol = findHeader(dataSheet.headers, NAME_HEADERS);
  if (!goodfitNameCol) {
    return ERR.validation({
      reason: "goodfit_file must contain a Name column",
      goodfit_headers: goodfit.headers,
    });
  }
  if (!dataNameCol) {
    return ERR.validation({
      reason: "data_file must contain a Name column",
      data_headers: dataSheet.headers,
    });
  }

  // Locate fields in the data file we'll persist
  const dataEmailCol = findHeader(dataSheet.headers, EMAIL_HEADERS);
  const dataPhoneCol = findHeader(dataSheet.headers, PHONE_HEADERS);
  const dataLinkedinCol = findHeader(dataSheet.headers, LINKEDIN_HEADERS);
  const dataTitleCol = findHeader(dataSheet.headers, TITLE_HEADERS);
  const dataCompanyCol = findHeader(dataSheet.headers, COMPANY_HEADERS);
  const dataSchoolCol = findHeader(dataSheet.headers, SCHOOL_HEADERS);
  const dataLocationCol = findHeader(dataSheet.headers, LOCATION_HEADERS);
  const dataAppliedCol = findHeader(dataSheet.headers, APPLIED_HEADERS);
  const dataResumeCol = findHeader(dataSheet.headers, RESUME_HEADERS);
  const dataScoreCol = findHeader(dataSheet.headers, SCORE_HEADERS);

  // Build normalized name set from goodfit file
  const goodfitNames = new Map<string, string>(); // norm → original
  for (const row of goodfit.rows) {
    const original = (row[goodfitNameCol] ?? "").trim();
    const n = normName(original);
    if (n) goodfitNames.set(n, original);
  }

  // Walk the data file, keep rows whose name appears in the goodfit set
  type MatchedRow = {
    row: Record<string, string>;
    name: string;
    email: string | null;
    norm: string;
  };
  const matchedRows: MatchedRow[] = [];
  const matchedNorms = new Set<string>();
  for (const row of dataSheet.rows) {
    const rawName = (row[dataNameCol] ?? "").trim();
    const n = normName(rawName);
    if (!n) continue;
    if (!goodfitNames.has(n)) continue;
    const email = dataEmailCol ? normCell(row[dataEmailCol]) : null;
    if (email && !EMAIL_RE.test(email)) {
      // Treat malformed email as no email rather than failing the row.
      matchedRows.push({ row, name: rawName, email: null, norm: n });
    } else {
      matchedRows.push({ row, name: rawName, email, norm: n });
    }
    matchedNorms.add(n);
  }

  // Names in goodfit list that didn't find a match in data file
  const unmatched_goodfit_names: string[] = [];
  for (const [n, original] of goodfitNames) {
    if (!matchedNorms.has(n)) unmatched_goodfit_names.push(original);
  }

  // Dedupe by email within the matched batch (keep first occurrence)
  const seenEmailsInBatch = new Set<string>();
  const debatched: MatchedRow[] = [];
  for (const m of matchedRows) {
    if (m.email) {
      const k = m.email.toLowerCase();
      if (seenEmailsInBatch.has(k)) continue;
      seenEmailsInBatch.add(k);
    }
    debatched.push(m);
  }

  // Emails already in this campaign — compared case-insensitively. Stored emails
  // keep their original case, so querying by lower-cased values would miss them
  // and cause duplicate-key crashes on re-import.
  const existingRows = await db
    .select({ email: candidates.email })
    .from(candidates)
    .where(eq(candidates.campaignId, campaignId));
  const existingSet = new Set<string>();
  for (const r of existingRows) {
    if (r.email) existingSet.add(r.email.toLowerCase());
  }

  // Final insert list (skip rows already in DB)
  let skipped_existing = 0;
  const toInsert: MatchedRow[] = [];
  for (const m of debatched) {
    if (m.email && existingSet.has(m.email.toLowerCase())) {
      skipped_existing++;
      continue;
    }
    toInsert.push(m);
  }

  let insertedCount = 0;
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(candidates)
      .values(
        toInsert.map((m, i) => ({
          fullName: m.name,
          email: m.email,
          phone: dataPhoneCol ? normCell(m.row[dataPhoneCol]) : null,
          linkedinUrl: dataLinkedinCol ? normCell(m.row[dataLinkedinCol]) : null,
          currentTitle: dataTitleCol ? normCell(m.row[dataTitleCol]) : null,
          currentCompany: dataCompanyCol ? normCell(m.row[dataCompanyCol]) : null,
          school: dataSchoolCol ? normCell(m.row[dataSchoolCol]) : null,
          location: dataLocationCol ? normCell(m.row[dataLocationCol]) : null,
          applicationDate: dataAppliedCol ? normCell(m.row[dataAppliedCol]) : null,
          resumeUrl: dataResumeCol ? normCell(m.row[dataResumeCol]) : null,
          applicantsyncScore: dataScoreCol ? normCell(m.row[dataScoreCol]) : null,
          // Stash every non-standard column from the data file so HR can see
          // them later (LinkedIn screening Q answers etc.)
          linkedinData: Object.fromEntries(
            Object.entries(m.row).filter(([k, v]) => {
              if (!v) return false;
              const lk = k.toLowerCase();
              // Skip columns we already lifted into typed fields above.
              return ![
                dataNameCol,
                dataEmailCol,
                dataPhoneCol,
                dataLinkedinCol,
                dataTitleCol,
                dataCompanyCol,
                dataSchoolCol,
                dataLocationCol,
                dataAppliedCol,
                dataResumeCol,
                dataScoreCol,
              ]
                .filter((c): c is string => !!c)
                .map((c) => c.toLowerCase())
                .includes(lk);
            }),
          ) as Record<string, string>,
          campaignId,
          googleSheetRow: i + 1,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: candidates.id });
    insertedCount = inserted.length;
  }

  const skipped_no_email = toInsert.filter((m) => !m.email).length;

  await logAudit({
    actor: session.actor,
    action: "candidates.imported.filtered",
    entityType: "campaign",
    entityId: campaignId,
    metadata: {
      goodfit_total: goodfit.rows.length,
      data_total: dataSheet.rows.length,
      matched: matchedRows.length,
      imported: insertedCount,
      skipped_existing,
      skipped_no_email,
      unmatched_goodfit_count: unmatched_goodfit_names.length,
    },
  });

  const body: ImportFilteredResult = {
    goodfit_total: goodfit.rows.length,
    data_total: dataSheet.rows.length,
    matched: matchedRows.length,
    imported: insertedCount,
    skipped_existing,
    skipped_no_email,
    unmatched_goodfit_names,
  };
  return NextResponse.json(body);
});
