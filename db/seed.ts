import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set — fill in .env.local first.");
  process.exit(1);
}

const STAGES = [
  { id: "imported", label: "Imported", position: 1 },
  { id: "good_fit", label: "Good Fit", position: 2 },
  { id: "stage1_sent", label: "Stage-1 Sent", position: 3 },
  { id: "form_submitted", label: "Form Submitted", position: 4 },
  { id: "evaluated", label: "Evaluated", position: 5 },
  { id: "reminder_sent", label: "Reminder Sent", position: 6 },
  { id: "stage2_sent", label: "Stage-2 Sent", position: 7 },
  { id: "confirmed", label: "Confirmed", position: 8 },
  { id: "rejected", label: "Rejected", position: 9 },
] as const;

async function run() {
  const sql = postgres(url!, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log("Seeding stages …");
  for (const s of STAGES) {
    await db
      .insert(schema.stages)
      .values({ id: s.id, label: s.label, position: s.position })
      .onConflictDoNothing({ target: schema.stages.id });
  }

  await sql.end();
  console.log(`Seed complete: ${STAGES.length} stages.`);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
