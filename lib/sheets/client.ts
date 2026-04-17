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

const SHEET_URL_RE =
  /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/.*?(?:[?&#]gid=(\d+))?)?/;

export function parseSheetUrl(url: string): {
  spreadsheetId: string;
  gid: number;
} {
  const match = url.match(SHEET_URL_RE);
  if (!match?.[1]) {
    throw new Error(`Cannot extract spreadsheet ID from URL: ${url}`);
  }
  return {
    spreadsheetId: match[1],
    gid: match[2] ? Number(match[2]) : 0,
  };
}

export async function getSheet(
  url: string,
): Promise<{ doc: GoogleSpreadsheet; sheetIndex: number }> {
  const { spreadsheetId, gid } = parseSheetUrl(url);
  const jwt = getJwt();

  const doc = new GoogleSpreadsheet(spreadsheetId, jwt);
  await doc.loadInfo();

  const sheet = doc.sheetsByIndex.find((s) => s.sheetId === gid);
  if (!sheet) {
    throw new Error(`Sheet with gid=${gid} not found in spreadsheet`);
  }

  const sheetIndex = doc.sheetsByIndex.indexOf(sheet);
  return { doc, sheetIndex };
}
