import type { ColumnMapping } from "@/lib/types";
import { getSheet, parseSheetUrl } from "./client";

export type SheetRow = {
  row_number: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;                  // v0.2 — ApplicantSync "Phone"
  linkedin_url: string | null;
  role: string | null;                   // multi-role sheets; null for ApplicantSync
  headline: string | null;               // LinkedIn profile headline; null for ApplicantSync
  current_title: string | null;          // v0.2 — ApplicantSync "Title" (candidate's current job)
  current_company: string | null;        // v0.2 — ApplicantSync "Company"
  school: string | null;                 // v0.2 — ApplicantSync "School"
  location: string | null;
  application_date: string | null;       // ApplicantSync "Applied Date"
  resume_url: string | null;             // v0.2 — ApplicantSync "Resume URL"
  applicantsync_score: string | null;    // v0.2 — ApplicantSync "Screening Score", e.g. "9/11"
  raw: Record<string, string>;           // every column verbatim (incl. "Status" + LinkedIn screening-Q answers → Basil's linkedin_data JSONB)
};

export type SheetFetchError = { row: number; reason: string };

export type FetchSheetRowsResult = {
  rows: SheetRow[];
  errors: SheetFetchError[];
  header_row: string[];
  sheet_title: string;
};

export class SheetUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetUnreachableError";
  }
}

export class SheetUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetUpstreamError";
  }
}

const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  full_name: [
    "name",
    "full name",
    "full_name",
    "candidate name",
    "candidate",
    "applicant name",
    "applicant",
  ],
  email: [
    "email",
    "email address",
    "e-mail",
    "mail",
    "email id",
    "contact email",
  ],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "contact number",
    "contact",
    "cell",
  ],
  linkedin_url: [
    "linkedin",
    "linkedin url",
    "linkedin profile",
    "profile url",
    "linkedin link",
    "profile link",
    "profile",
  ],
  // v0.2: "title" + "job title" moved to current_title — ApplicantSync's
  // "Title" header is the candidate's current job title, not the role applied.
  role: [
    "role",
    "position",
    "applied for",
    "applied role",
    "role applied",
  ],
  // v0.2: "current title" + "current position" moved to current_title.
  // headline retained for LinkedIn-headline-specific imports (legacy v2.1).
  headline: [
    "headline",
    "linkedin headline",
    "professional headline",
  ],
  current_title: [
    "title",
    "job title",
    "current title",
    "current position",
    "current job",
    "current role",
  ],
  current_company: [
    "company",
    "current company",
    "employer",
    "current employer",
    "organization",
    "organisation",
  ],
  school: [
    "school",
    "university",
    "college",
    "alma mater",
    "education",
  ],
  location: [
    "location",
    "city",
    "region",
    "country",
    "address",
    "candidate location",
  ],
  application_date: [
    "application date",
    "applied on",
    "applied date",
    "date applied",
    "date",
    "submission date",
    "applied at",
  ],
  resume_url: [
    "resume",
    "resume url",
    "resume link",
    "cv",
    "cv url",
    "cv link",
  ],
  applicantsync_score: [
    "screening score",
    "applicantsync score",
    "score",
    "match score",
    "jd match",
    "jd match score",
    "jd-match score",
  ],
};

export function suggestMapping(
  headers: string[],
): Partial<ColumnMapping> {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const result: Partial<ColumnMapping> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) {
      result[field as keyof ColumnMapping] = headers[idx];
    }
  }

  return result;
}

function extractCell(
  rowData: Record<string, string>,
  headerName: string | undefined,
): string | null {
  if (!headerName) return null;
  const val = rowData[headerName];
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed === "" ? null : trimmed;
}

export async function fetchSheetRows(args: {
  url: string;
  mapping: ColumnMapping;
  batchSize?: number;
}): Promise<FetchSheetRowsResult> {
  const { url, mapping, batchSize = 100 } = args;

  let doc;
  let sheetIndex: number;
  try {
    ({ doc, sheetIndex } = await getSheet(url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("not found") ||
      msg.includes("Cannot extract") ||
      msg.includes("Missing GOOGLE_SERVICE_ACCOUNT")
    ) {
      throw new SheetUnreachableError(msg);
    }
    throw new SheetUpstreamError(msg);
  }

  const sheet = doc.sheetsByIndex[sheetIndex];
  const sheetTitle = sheet.title;

  let allRawRows;
  try {
    allRawRows = await sheet.getRows();
  } catch (err) {
    throw new SheetUpstreamError(
      err instanceof Error ? err.message : String(err),
    );
  }

  const headerRow = sheet.headerValues ?? [];

  const rows: SheetRow[] = [];
  const errors: SheetFetchError[] = [];

  for (let i = 0; i < allRawRows.length; i += batchSize) {
    const batch = allRawRows.slice(i, i + batchSize);

    for (const rawRow of batch) {
      const rowNumber = rawRow.rowNumber;
      const raw: Record<string, string> = {};
      for (const header of headerRow) {
        const val = rawRow.get(header);
        if (val !== undefined && val !== null) {
          raw[header] = String(val);
        }
      }

      try {
        const full_name = extractCell(raw, mapping.full_name);
        const role = extractCell(raw, mapping.role);
        const email = extractCell(raw, mapping.email);
        const phone = extractCell(raw, mapping.phone);
        const linkedin_url = extractCell(raw, mapping.linkedin_url);
        const headline = extractCell(raw, mapping.headline);
        const current_title = extractCell(raw, mapping.current_title);
        const current_company = extractCell(raw, mapping.current_company);
        const school = extractCell(raw, mapping.school);
        const location = extractCell(raw, mapping.location);
        const application_date = extractCell(raw, mapping.application_date);
        const resume_url = extractCell(raw, mapping.resume_url);
        const applicantsync_score = extractCell(raw, mapping.applicantsync_score);

        if (!full_name && !email && !role && !linkedin_url) {
          errors.push({ row: rowNumber, reason: "empty row" });
          continue;
        }

        rows.push({
          row_number: rowNumber, full_name, email, phone, linkedin_url, role,
          headline, current_title, current_company, school, location,
          application_date, resume_url, applicantsync_score, raw,
        });
      } catch (err) {
        errors.push({
          row: rowNumber,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { rows, errors, header_row: headerRow, sheet_title: sheetTitle };
}
