import type { ColumnMapping } from "@/lib/types";
import { getSheet, parseSheetUrl } from "./client";

export type SheetRow = {
  row_number: number;
  full_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  role: string | null;
  headline: string | null;
  location: string | null;
  application_date: string | null;
  raw: Record<string, string>;
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
  linkedin_url: [
    "linkedin",
    "linkedin url",
    "linkedin profile",
    "profile url",
    "linkedin link",
    "profile link",
    "profile",
  ],
  role: [
    "role",
    "position",
    "job title",
    "title",
    "applied for",
    "applied role",
    "role applied",
  ],
  headline: [
    "headline",
    "linkedin headline",
    "current title",
    "current position",
    "professional headline",
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
        const linkedin_url = extractCell(raw, mapping.linkedin_url);
        const headline = extractCell(raw, mapping.headline);
        const location = extractCell(raw, mapping.location);
        const application_date = extractCell(raw, mapping.application_date);

        if (!full_name && !email && !role && !linkedin_url) {
          errors.push({ row: rowNumber, reason: "empty row" });
          continue;
        }

        rows.push({
          row_number: rowNumber, full_name, email, linkedin_url, role,
          headline, location, application_date, raw,
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
