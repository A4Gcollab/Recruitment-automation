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
  // Exact match first
  let val = rowData[headerName];
  // Case-insensitive fallback
  if (val === undefined || val === null) {
    const lower = headerName.toLowerCase();
    for (const [key, v] of Object.entries(rowData)) {
      if (key.toLowerCase() === lower) { val = v; break; }
    }
  }
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed === "" ? null : trimmed;
}

/** Resolve each mapping field to an actual sheet header, using aliases as fallback.
 *  e.g. if mapping says "Full Name" but sheet has "Name", alias lookup finds it. */
function resolveMapping(
  mapping: ColumnMapping,
  sheetHeaders: string[],
): ColumnMapping {
  const resolved = { ...mapping };
  const headersLower = sheetHeaders.map(h => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const key = field as keyof ColumnMapping;
    const userValue = mapping[key];
    if (!userValue) continue;
    // Check if the user-provided value matches any actual header (case-insensitive)
    const directMatch = headersLower.includes(userValue.toLowerCase().trim());
    if (directMatch) continue; // already good
    // Try aliases: find a sheet header that matches one of the known aliases
    for (const alias of aliases) {
      const idx = headersLower.indexOf(alias);
      if (idx !== -1) {
        resolved[key] = sheetHeaders[idx];
        break;
      }
    }
  }
  return resolved;
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
  const effectiveMapping = resolveMapping(mapping, headerRow);

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
        const full_name = extractCell(raw, effectiveMapping.full_name);
        const role = extractCell(raw, effectiveMapping.role);
        const email = extractCell(raw, effectiveMapping.email);
        const phone = extractCell(raw, effectiveMapping.phone);
        const linkedin_url = extractCell(raw, effectiveMapping.linkedin_url);
        const headline = extractCell(raw, effectiveMapping.headline);
        const current_title = extractCell(raw, effectiveMapping.current_title);
        const current_company = extractCell(raw, effectiveMapping.current_company);
        const school = extractCell(raw, effectiveMapping.school);
        const location = extractCell(raw, effectiveMapping.location);
        const application_date = extractCell(raw, effectiveMapping.application_date);
        const resume_url = extractCell(raw, effectiveMapping.resume_url);
        const applicantsync_score = extractCell(raw, effectiveMapping.applicantsync_score);

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
