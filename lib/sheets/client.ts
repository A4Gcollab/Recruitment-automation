import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

let cachedJwt: JWT | null = null;

function getJwt(): JWT {
  if (cachedJwt) return cachedJwt;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    );
  }

  cachedJwt = new JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return cachedJwt;
}

const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const SHEET_GID_RE = /[?&#]gid=(\d+)/;

export function parseSheetUrl(url: string): {
  spreadsheetId: string;
  gid: number | null; // null means "no gid in URL — use first sheet"
} {
  const idMatch = url.match(SHEET_ID_RE);
  if (!idMatch?.[1]) {
    throw new Error(`Cannot extract spreadsheet ID from URL: ${url}`);
  }
  const gidMatch = url.match(SHEET_GID_RE);
  return {
    spreadsheetId: idMatch[1],
    gid: gidMatch ? Number(gidMatch[1]) : null,
  };
}

export async function getSheet(
  url: string,
): Promise<{ doc: GoogleSpreadsheet; sheetIndex: number }> {
  const { spreadsheetId, gid } = parseSheetUrl(url);
  const jwt = getJwt();

  const doc = new GoogleSpreadsheet(spreadsheetId, jwt);
  await doc.loadInfo();

  let sheetIndex: number;
  if (gid === null) {
    // No gid in URL — use the first sheet tab (index 0)
    sheetIndex = 0;
  } else {
    const sheet = doc.sheetsByIndex.find((s) => s.sheetId === gid);
    if (!sheet) {
      throw new Error(`Sheet with gid=${gid} not found in spreadsheet`);
    }
    sheetIndex = doc.sheetsByIndex.indexOf(sheet);
  }

  if (!doc.sheetsByIndex[sheetIndex]) {
    throw new Error("Spreadsheet has no sheets");
  }

  return { doc, sheetIndex };
}
