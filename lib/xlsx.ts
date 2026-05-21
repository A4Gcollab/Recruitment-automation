import "server-only";
import * as XLSX from "xlsx";

// XLSX (SheetJS) helpers shared by export + import routes.
// Pure JS, no native deps — works on Vercel serverless out of the box.

/**
 * Build an XLSX workbook with a single sheet from an array-of-arrays.
 * First row is treated as the header; subsequent rows are data.
 * Returns a Buffer ready to stream as a Node.js Response body.
 */
export function buildXlsxBuffer(args: {
  sheetName: string;
  rows: (string | number | null)[][];
}): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(args.rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, args.sheetName.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/**
 * Parse an XLSX Buffer into an array-of-objects (header → cell value).
 * Trims string cells; preserves blank cells as empty strings, not undefined.
 * Returns the header order so the caller can find a column by name.
 */
export function parseXlsxBuffer(buf: Buffer): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const wb = XLSX.read(buf, { type: "buffer" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };

  const ws = wb.Sheets[firstSheetName];
  // header: 1 → array-of-arrays so we can keep header order + handle blank rows
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  if (aoa.length === 0) return { headers: [], rows: [] };

  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] ?? [];
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const v = cells[j];
      row[headers[j]!] =
        v === undefined || v === null ? "" : String(v).trim();
    }
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Case-insensitive header lookup. Returns the verbatim header string from
 * `headers` that case-insensitively matches one of `candidates`, or null.
 */
export function findHeader(
  headers: string[],
  candidates: string[],
): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return headers[idx]!;
  }
  return null;
}

/**
 * Slugify a campaign role name for filename use.
 * "Product Manager Intern" → "product-manager-intern".
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "campaign";
}

/** YYYYMMDD UTC date string for filenames. */
export function ymd(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
