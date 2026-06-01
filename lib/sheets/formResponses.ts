import { getSheet, parseSheetUrl } from "./client";
import {
  SheetUnreachableError,
  SheetUpstreamError,
  type SheetFetchError,
} from "./fetchRows";

export { SheetUnreachableError, SheetUpstreamError };

export type FormResponse = {
  row_number: number;
  submitted_at: string | null; // ISO 8601 UTC; null if Forms timestamp unparseable
  submitted_at_raw: string; // raw Forms cell, e.g. "5/19/2026 16:36:42"
  email: string | null; // lowercased, trimmed; null if blank/missing column
  answers: Record<string, string>; // header → answer, excluding Timestamp + email column
  raw: Record<string, string>; // every column (incl. Timestamp + email) untouched
};

export type FetchFormResponsesResult = {
  responses: FormResponse[];
  errors: SheetFetchError[];
  header_row: string[];
  email_header: string | null; // which header we used for email, for UI/debug
  sheet_title: string;
};

// Header aliases (case-insensitive). Forms doesn't have a single canonical
// header for the email question — depends on what the recruiter named it.
const TIMESTAMP_ALIASES = ["timestamp", "submitted at", "submitted_at", "date submitted"];
const EMAIL_ALIASES = [
  "email address",
  "email",
  "e-mail",
  "your email",
  "your email address",
  "email id",
];

function findHeaderCI(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const a of aliases) {
    const idx = lower.indexOf(a.toLowerCase());
    if (idx !== -1) return headers[idx]!;
  }
  return null;
}

function parseFormsTimestamp(raw: string): string | null {
  if (!raw) return null;
  // Google Forms emits locale-dependent strings like "5/19/2026 16:36:42" or
  // "5/19/2026 16:36:42 GMT+5:30". JS Date can usually parse these on first try.
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString();
  // Fallback: try MM/DD/YYYY HH:MM:SS explicitly
  const m = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (m) {
    const [, mo, da, yr, hr, mi, se] = m;
    const iso = new Date(
      Date.UTC(
        parseInt(yr!, 10),
        parseInt(mo!, 10) - 1,
        parseInt(da!, 10),
        parseInt(hr!, 10),
        parseInt(mi!, 10),
        se ? parseInt(se, 10) : 0,
      ),
    );
    if (!isNaN(iso.getTime())) return iso.toISOString();
  }
  return null;
}

function normEmail(raw: string): string | null {
  const t = raw?.trim().toLowerCase();
  return t && t !== "" ? t : null;
}

export async function fetchFormResponses(args: {
  url: string;
  emailQuestionHeader?: string; // override default detection
}): Promise<FetchFormResponsesResult> {
  // Validate URL shape upfront so callers get a clean error.
  try {
    parseSheetUrl(args.url);
  } catch (err) {
    throw new SheetUnreachableError(
      err instanceof Error ? err.message : String(err),
    );
  }

  let doc, sheetIndex;
  try {
    const got = await getSheet(args.url);
    doc = got.doc;
    sheetIndex = got.sheetIndex;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("Cannot extract") ||
      msg.includes("Sheet with gid") ||
      msg.includes("not found") ||
      msg.includes("Missing GOOGLE_SERVICE_ACCOUNT") ||
      msg.includes("not been shared")
    ) {
      throw new SheetUnreachableError(msg);
    }
    throw new SheetUpstreamError(msg);
  }

  const sheet = doc.sheetsByIndex[sheetIndex];
  if (!sheet) {
    throw new SheetUpstreamError("Could not load sheet from spreadsheet");
  }
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
  const timestampHeader = findHeaderCI(headerRow, TIMESTAMP_ALIASES);
  const emailHeader = args.emailQuestionHeader
    ? findHeaderCI(headerRow, [args.emailQuestionHeader])
    : findHeaderCI(headerRow, EMAIL_ALIASES);

  const responses: FormResponse[] = [];
  const errors: SheetFetchError[] = [];

  for (const rawRow of allRawRows) {
    const rowNumber = rawRow.rowNumber;
    const raw: Record<string, string> = {};
    for (const header of headerRow) {
      const val = rawRow.get(header);
      if (val !== undefined && val !== null) {
        raw[header] = String(val);
      }
    }

    const submittedRaw = timestampHeader ? (raw[timestampHeader] ?? "") : "";
    const submittedIso = parseFormsTimestamp(submittedRaw);
    const email = emailHeader ? normEmail(raw[emailHeader] ?? "") : null;

    if (!submittedRaw && !email && Object.keys(raw).length === 0) {
      errors.push({ row: rowNumber, reason: "empty row" });
      continue;
    }
    if (!submittedRaw) {
      errors.push({ row: rowNumber, reason: "missing Timestamp column" });
      continue;
    }
    if (!submittedIso) {
      errors.push({
        row: rowNumber,
        reason: `unparseable timestamp "${submittedRaw}"`,
      });
      continue;
    }

    // answers: everything except Timestamp + the email column
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === timestampHeader) continue;
      if (emailHeader && k === emailHeader) continue;
      if (!v) continue;
      answers[k] = v;
    }

    responses.push({
      row_number: rowNumber,
      submitted_at: submittedIso,
      submitted_at_raw: submittedRaw,
      email,
      answers,
      raw,
    });
  }

  return {
    responses,
    errors,
    header_row: headerRow,
    email_header: emailHeader,
    sheet_title: sheetTitle,
  };
}
