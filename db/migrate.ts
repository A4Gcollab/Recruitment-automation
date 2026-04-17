import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set — fill in .env.local first.");
  process.exit(1);
}

async function run() {
  const sql = postgres(url!, { max: 1 });
  const db = drizzle(sql);
  console.log("Applying migrations from ./db/migrations …");
  await migrate(db, { migrationsFolder: "./db/migrations" });
  await sql.end();
  console.log("Migrations applied.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
