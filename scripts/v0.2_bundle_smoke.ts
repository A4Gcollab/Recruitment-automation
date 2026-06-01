// Smoke-tests the v0.2 bundle endpoints against the local Postgres:
//   - exercises the same DB queries the routes do
//   - drives the XLSX helpers end-to-end (build → parse round-trip)
//   - validates the send-bulk precondition + idempotency logic
//
// Run from project root: `npx tsx scripts/v0.2_bundle_smoke.ts`
//
// Leaves the test campaign in a consistent state (rolls back candidate updates
// at the end), and cleans up any temp email_queue rows it inserts.

import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import * as schema from "../db/schema";

// Inlined from lib/xlsx.ts (which imports "server-only" and can't be loaded
// from a plain tsx script). These helpers are byte-identical to the route code.
function buildXlsxBuffer(args: { sheetName: string; rows: (string | number | null)[][] }): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(args.rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, args.sheetName.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
function parseXlsxBuffer(buf: Buffer): { headers: string[]; rows: Array<Record<string, string>> } {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] ?? [];
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const v = cells[j];
      row[headers[j]!] = v === undefined || v === null ? "" : String(v).trim();
    }
    rows.push(row);
  }
  return { headers, rows };
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "campaign";
}
function ymd(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(sql, { schema });

async function smoke() {
  // 1. Pick the existing test campaign + candidate from the v0.1 schema.
  const [campaign] = await db.select().from(schema.campaigns).limit(1);
  if (!campaign) {
    throw new Error("no campaign in db — run the dev seed first");
  }
  console.log(`✓ campaign: ${campaign.id} ("${campaign.roleName}")`);

  const existingCandidates = await db
    .select()
    .from(schema.candidates)
    .where(eq(schema.candidates.campaignId, campaign.id));
  if (existingCandidates.length === 0) {
    throw new Error("no candidate in test campaign — run import first");
  }
  const candidate = existingCandidates[0]!;
  console.log(
    `✓ candidate: ${candidate.id} (${candidate.email ?? "no-email"})  stage=${candidate.stage}`,
  );

  // Snapshot for rollback at end.
  const before = {
    stage: candidate.stage,
    verdict: candidate.verdict,
    reason: candidate.reason,
    linkedinData: candidate.linkedinData,
  };

  // ---- 2. Set up state: verdict=good_fit + linkedin_data with a custom Q -----
  await db
    .update(schema.candidates)
    .set({
      stage: "evaluated_screen1",
      verdict: "good_fit",
      reason: "Strong match on PM background",
      linkedinData: {
        "Why this role?": "Looking for impact-driven NGO work",
        "Notice Period": "30 days",
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.candidates.id, candidate.id));
  console.log("✓ set verdict=good_fit, stage=evaluated_screen1, linkedin_data with 2 custom keys");

  // ---- 3. export-candidates: replicate the route query + XLSX build ----------
  const exportCands = await db
    .select()
    .from(schema.candidates)
    .where(eq(schema.candidates.campaignId, campaign.id));
  const dynamicKeySet = new Set<string>();
  for (const r of exportCands) {
    const bag = (r.linkedinData ?? {}) as Record<string, string>;
    for (const k of Object.keys(bag)) dynamicKeySet.add(k);
  }
  const dynamicKeys = Array.from(dynamicKeySet).sort();
  const header = [
    "name", "email", "linkedin_url", "phone", "current_title",
    "current_company", "school", "location", "applicantsync_score",
    "resume_url", ...dynamicKeys, "verdict", "reason",
  ];
  const dataRows = exportCands.map((r) => {
    const bag = (r.linkedinData ?? {}) as Record<string, string>;
    return [
      r.fullName, r.email, r.linkedinUrl, r.phone, r.currentTitle,
      r.currentCompany, r.school, r.location, r.applicantsyncScore,
      r.resumeUrl, ...dynamicKeys.map((k) => bag[k] ?? ""),
      r.verdict ?? "", r.reason ?? "",
    ];
  });
  const buf = buildXlsxBuffer({ sheetName: "candidates", rows: [header, ...dataRows] });
  const fn = `candidates-${slugify(campaign.roleName)}-${ymd()}.xlsx`;
  console.log(`✓ export-candidates buffer built: ${buf.byteLength} bytes  filename="${fn}"`);
  console.log(`  header (${header.length} cols): ${header.join(" | ")}`);

  // Round-trip parse to prove integrity.
  const parsed = parseXlsxBuffer(buf);
  if (parsed.headers.length !== header.length) {
    throw new Error(`header round-trip mismatch: ${parsed.headers.length} vs ${header.length}`);
  }
  if (parsed.rows.length !== exportCands.length) {
    throw new Error(`row count mismatch: ${parsed.rows.length} vs ${exportCands.length}`);
  }
  console.log(`✓ round-trip parse OK: ${parsed.rows.length} rows, ${parsed.headers.length} cols`);
  console.log(`  row 1 verdict=${parsed.rows[0]?.["verdict"]}  Why this role?=${parsed.rows[0]?.["Why this role?"]}`);

  // ---- 4. import-evaluations dry-run: prove header detection + matching ------
  // Build a fake "ChatGPT-filled" XLSX with verdict + reason populated.
  const evalHeader = ["email", "linkedin_url", "verdict", "reason"];
  const evalRows = [
    evalHeader,
    [candidate.email, candidate.linkedinUrl, "good_fit", "Confirmed by ChatGPT review"],
  ] as (string | null)[][];
  const evalBuf = buildXlsxBuffer({ sheetName: "candidates", rows: evalRows });
  const evalParsed = parseXlsxBuffer(evalBuf);
  console.log(`✓ import-evaluations XLSX round-trip OK: ${evalParsed.rows.length} data row(s)`);
  // The route would then case-insensitive-find email/verdict, match the candidate,
  // and update verdict+reason+stage. We've already set that state above; the
  // route's stageGuard would skip with reason="wrong_stage" because candidate
  // is no longer in 'imported'. That's the expected behavior on a re-import.

  // ---- 5. send-bulk: precondition + idempotency check ------------------------
  // Synthesize the bulk-send id list logic.
  const idemKey = `bulk:${campaign.id}:stage1:${candidate.id}`;
  // Pre-clean any prior smoke runs.
  await db
    .delete(schema.emailQueue)
    .where(eq(schema.emailQueue.idempotencyKey, idemKey));

  // Re-fetch with the precondition WHERE clause.
  const eligibleRows = await db
    .select()
    .from(schema.candidates)
    .where(
      and(
        eq(schema.candidates.campaignId, campaign.id),
        inArray(schema.candidates.id, [candidate.id]),
        eq(schema.candidates.stage, "evaluated_screen1"),
        eq(schema.candidates.verdict, "good_fit"),
      ),
    );
  if (eligibleRows.length !== 1) {
    throw new Error(`expected 1 eligible candidate, got ${eligibleRows.length}`);
  }
  console.log("✓ send-bulk precondition matched the 1 eligible candidate");

  // First enqueue.
  const inserted = await db
    .insert(schema.emailQueue)
    .values({
      candidateId: candidate.id,
      campaignId: campaign.id,
      templateType: "stage1",
      scheduledFor: new Date(),
      idempotencyKey: idemKey,
    })
    .onConflictDoNothing({ target: schema.emailQueue.idempotencyKey })
    .returning({ id: schema.emailQueue.id });
  console.log(`✓ enqueued 1 row (queue_id=${inserted[0]?.id})`);

  // Second enqueue — should be idempotent no-op.
  const insertedAgain = await db
    .insert(schema.emailQueue)
    .values({
      candidateId: candidate.id,
      campaignId: campaign.id,
      templateType: "stage1",
      scheduledFor: new Date(),
      idempotencyKey: idemKey,
    })
    .onConflictDoNothing({ target: schema.emailQueue.idempotencyKey })
    .returning({ id: schema.emailQueue.id });
  if (insertedAgain.length !== 0) {
    throw new Error(`idempotency broken: second insert returned ${insertedAgain.length} rows`);
  }
  console.log("✓ idempotency holds: re-insert with same key returned 0 rows");

  // ---- 6. cleanup -----------------------------------------------------------
  await db
    .delete(schema.emailQueue)
    .where(eq(schema.emailQueue.idempotencyKey, idemKey));
  await db
    .update(schema.candidates)
    .set({
      stage: before.stage,
      verdict: before.verdict,
      reason: before.reason,
      linkedinData: (before.linkedinData ?? {}) as Record<string, string>,
      updatedAt: new Date(),
    })
    .where(eq(schema.candidates.id, candidate.id));
  console.log("✓ cleanup: candidate state restored, smoke email_queue row removed");

  await sql.end();
  console.log("\nALL SMOKES PASSED");
}

smoke().catch((err) => {
  console.error("\nSMOKE FAILED:", err);
  process.exit(1);
});
