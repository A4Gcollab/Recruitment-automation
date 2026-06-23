import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

const rows = await db.execute(sql`SELECT id, template_name, status, error_message, retry_count, scheduled_for FROM whatsapp_queue ORDER BY created_at DESC LIMIT 5`);
console.log("=== whatsapp_queue ===");
for (const r of rows) console.log(JSON.stringify(r));

const cands = await db.execute(sql`SELECT id, full_name, phone FROM candidates WHERE phone IS NOT NULL LIMIT 5`);
console.log("=== candidates with phone ===");
for (const c of cands) console.log(JSON.stringify(c));
await client.end();
