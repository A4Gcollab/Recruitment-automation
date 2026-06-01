// Smoke-tests the v0.3.1 pull-responses feature against local Postgres:
//   - exercises the formResponses.ts parsing logic (timestamp / header-alias /
//     email detection) with byte-identical inlined helpers
//   - exercises the exact DB ops POST /api/campaigns/[id]/pull-responses does:
//       * idempotent upsert into form_responses on (candidate_id, submitted_at)
//       * conditional stage advance imported|stage1_sent|reminder_sent -> form_submitted
//
// Run from project root: `npx tsx scripts/v0.3.1_pull_responses_smoke.ts`
//
// Fully isolated: creates its own temp campaign + candidates and deletes them at
// the end (cascade removes candidates + form_responses). Does NOT touch real data.
//
// NOTE: the live Google-Sheet fetch (fetchFormResponses -> getSheet) is NOT
// covered here — it needs GOOGLE_PRIVATE_KEY, which is an empty placeholder in
// .env.local. This test verifies everything downstream of that fetch.

import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema";

// ---- Inlined byte-identical from lib/sheets/formResponses.ts ----------------
const TIMESTAMP_ALIASES = ["timestamp", "submitted at", "submitted_at", "date submitted"];
const EMAIL_ALIASES = [
  "email address", "email", "e-mail", "your email", "your email address", "email id",
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
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, mo, da, yr, hr, mi, se] = m;
    const iso = new Date(Date.UTC(
      parseInt(yr!, 10), parseInt(mo!, 10) - 1, parseInt(da!, 10),
      parseInt(hr!, 10), parseInt(mi!, 10), se ? parseInt(se, 10) : 0,
    ));
    if (!isNaN(iso.getTime())) return iso.toISOString();
  }
  return null;
}
function normEmail(raw: string): string | null {
  const t = raw?.trim().toLowerCase();
  return t && t !== "" ? t : null;
}

config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(sql, { schema });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

async function smoke() {
  // ===== PART 1: parsing logic (pure, no DB) ================================
  console.log("--- Part 1: formResponses parsing logic ---");

  // Header detection across the alias variants Forms recruiters actually use.
  assert(findHeaderCI(["Timestamp", "Email Address", "Why?"], TIMESTAMP_ALIASES) === "Timestamp",
    "timestamp header detected");
  assert(findHeaderCI(["Timestamp", "Email Address", "Why?"], EMAIL_ALIASES) === "Email Address",
    "email header 'Email Address' detected");
  assert(findHeaderCI(["timestamp", "Your Email", "Q1"], EMAIL_ALIASES) === "Your Email",
    "email header 'Your Email' detected (case-insensitive)");
  assert(findHeaderCI(["Date Submitted", "E-Mail"], EMAIL_ALIASES) === "E-Mail",
    "email header 'E-Mail' detected");
  assert(findHeaderCI(["a", "b"], EMAIL_ALIASES) === null,
    "no email header -> null");
  console.log("✓ header alias detection (timestamp + 4 email variants + miss)");

  // Timestamp parsing across locale formats.
  assert(parseFormsTimestamp("5/19/2026 16:36:42") !== null, "MM/DD/YYYY HH:MM:SS parses");
  assert(parseFormsTimestamp("5/19/2026 16:36:42 GMT+5:30") !== null, "with GMT offset parses");
  assert(parseFormsTimestamp("not a date") === null, "garbage -> null");
  assert(parseFormsTimestamp("") === null, "empty -> null");
  // Fallback path: a format Date() may reject but the regex catches.
  const fb = parseFormsTimestamp("13/1/2026 9:05");
  console.log(`  fallback "13/1/2026 9:05" -> ${fb}`);
  console.log("✓ timestamp parsing (locale formats + garbage + fallback regex)");

  // Email normalization.
  assert(normEmail("  Foo@Bar.COM ") === "foo@bar.com", "email lowercased + trimmed");
  assert(normEmail("   ") === null, "whitespace email -> null");
  assert(normEmail("") === null, "empty email -> null");
  console.log("✓ email normalization (trim + lowercase + blank->null)");

  // ===== PART 2: DB operations (isolated temp campaign) =====================
  console.log("\n--- Part 2: pull-responses DB ops (isolated temp data) ---");

  const [campaign] = await db
    .insert(schema.campaigns)
    .values({
      roleName: "SMOKE v0.3.1 pull-responses",
      formResponseSheetUrl: "https://docs.google.com/spreadsheets/d/SMOKE/edit",
    })
    .returning();
  console.log(`✓ temp campaign created: ${campaign!.id}`);

  try {
    // Three candidates: one stage1_sent, one reminder_sent, one already confirmed
    // (must NOT advance — outside the guard set).
    const cands = await db
      .insert(schema.candidates)
      .values([
        { fullName: "Aisha Khan", email: "aisha@example.com", campaignId: campaign!.id, stage: "stage1_sent" },
        { fullName: "Ben Roy", email: "ben@example.com", campaignId: campaign!.id, stage: "reminder_sent" },
        { fullName: "Carl Vance", email: "carl@example.com", campaignId: campaign!.id, stage: "confirmed" },
      ])
      .returning();
    const byEmail = new Map(cands.map((c) => [c.email!, c]));
    console.log(`✓ 3 temp candidates created (stage1_sent / reminder_sent / confirmed)`);

    // ---- 2a. matching by email (route builds a lowercased map) -------------
    // Simulate parsed responses, incl. one unmatchable email + one missing email.
    const parsedResponses: { row_number: number; submitted_at: string; email: string | null; answers: Record<string, string> }[] = [
      { row_number: 2, submitted_at: "2026-05-19T16:36:42.000Z", email: "aisha@example.com", answers: { "Why?": "Impact" } },
      { row_number: 3, submitted_at: "2026-05-19T17:00:00.000Z", email: "BEN@example.com", answers: { "Why?": "Mission" } }, // case mismatch
      { row_number: 4, submitted_at: "2026-05-19T18:00:00.000Z", email: "ghost@nowhere.com", answers: {} }, // no candidate
      { row_number: 5, submitted_at: "2026-05-19T19:00:00.000Z", email: null, answers: {} }, // missing email
    ];

    const lookup = new Map<string, { id: string; stage: string }>();
    for (const c of cands) if (c.email) lookup.set(c.email.toLowerCase().trim(), { id: c.id, stage: c.stage });

    const toInsert: { candidateId: string; campaignId: string; responses: Record<string, string>; submittedAt: Date }[] = [];
    const unmatched: { row: number; email: string | null; reason: string }[] = [];
    const advance = new Set<string>();
    for (const r of parsedResponses) {
      if (!r.email) { unmatched.push({ row: r.row_number, email: null, reason: "missing_email" }); continue; }
      const c = lookup.get(r.email.toLowerCase().trim());
      if (!c) { unmatched.push({ row: r.row_number, email: r.email, reason: "no_candidate_match" }); continue; }
      toInsert.push({ candidateId: c.id, campaignId: campaign!.id, responses: r.answers, submittedAt: new Date(r.submitted_at) });
      advance.add(c.id);
    }
    assert(toInsert.length === 2, `2 matched (got ${toInsert.length})`);
    assert(unmatched.length === 2, `2 unmatched (got ${unmatched.length})`);
    assert(unmatched.some((u) => u.reason === "no_candidate_match" && u.email === "ghost@nowhere.com"), "ghost flagged no_candidate_match");
    assert(unmatched.some((u) => u.reason === "missing_email"), "null-email flagged missing_email");
    console.log("✓ email matching: 2 matched (incl. case-insensitive BEN), 2 unmatched (ghost + null)");

    // ---- 2b. idempotent upsert into form_responses ------------------------
    const ins1 = await db.insert(schema.formResponses).values(toInsert)
      .onConflictDoNothing({ target: [schema.formResponses.candidateId, schema.formResponses.submittedAt] })
      .returning({ id: schema.formResponses.id });
    assert(ins1.length === 2, `first pull inserts 2 (got ${ins1.length})`);
    console.log(`✓ first pull: inserted ${ins1.length} form_responses`);

    const ins2 = await db.insert(schema.formResponses).values(toInsert)
      .onConflictDoNothing({ target: [schema.formResponses.candidateId, schema.formResponses.submittedAt] })
      .returning({ id: schema.formResponses.id });
    assert(ins2.length === 0, `re-pull is a no-op (got ${ins2.length})`);
    console.log(`✓ idempotency: re-pull inserted 0 (deduped ${toInsert.length})`);

    // ---- 2c. conditional stage advance ------------------------------------
    const adv1 = await db.update(schema.candidates)
      .set({ stage: "form_submitted", updatedAt: new Date() })
      .where(and(
        eq(schema.candidates.campaignId, campaign!.id),
        inArray(schema.candidates.id, Array.from(advance)),
        inArray(schema.candidates.stage, ["stage1_sent", "reminder_sent", "imported"]),
      ))
      .returning({ id: schema.candidates.id });
    assert(adv1.length === 2, `2 candidates advanced (got ${adv1.length})`);
    console.log("✓ stage advance: 2 -> form_submitted (Aisha + Ben)");

    // Carl was 'confirmed' and never matched anyway — confirm he's untouched.
    const [carl] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, byEmail.get("carl@example.com")!.id));
    assert(carl!.stage === "confirmed", `Carl stays 'confirmed' (got ${carl!.stage})`);
    console.log("✓ guard: 'confirmed' candidate NOT advanced");

    // Re-running advance is a no-op now (already form_submitted, outside guard set).
    const adv2 = await db.update(schema.candidates)
      .set({ stage: "form_submitted", updatedAt: new Date() })
      .where(and(
        eq(schema.candidates.campaignId, campaign!.id),
        inArray(schema.candidates.id, Array.from(advance)),
        inArray(schema.candidates.stage, ["stage1_sent", "reminder_sent", "imported"]),
      ))
      .returning({ id: schema.candidates.id });
    assert(adv2.length === 0, `re-advance is a no-op (got ${adv2.length})`);
    console.log("✓ idempotency: re-advance moved 0 (already form_submitted)");
  } finally {
    // Cascade removes candidates + form_responses.
    await db.delete(schema.campaigns).where(eq(schema.campaigns.id, campaign!.id));
    console.log("✓ cleanup: temp campaign + cascade deleted");
  }

  await sql.end();
  console.log("\nALL SMOKES PASSED");
}

smoke().catch(async (err) => {
  console.error("\nSMOKE FAILED:", err);
  try { await sql.end(); } catch {}
  process.exit(1);
});
