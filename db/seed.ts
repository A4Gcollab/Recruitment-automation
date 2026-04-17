import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set — fill in .env.local first.");
  process.exit(1);
}

const TEMPLATE_PLACEHOLDER_HTML =
  "<p>Placeholder body — real copy lands in v0.4.</p>" +
  "<p>Hi {CandidateFirstName}, this is a placeholder for the {RoleName} email.</p>" +
  '<p><a href="{UnsubscribeLink}">Unsubscribe</a></p>';

const TEMPLATE_PLACEHOLDER_TEXT =
  "Placeholder body — real copy lands in v0.4.\n\n" +
  "Hi {CandidateFirstName}, this is a placeholder for the {RoleName} email.\n\n" +
  "Unsubscribe: {UnsubscribeLink}\n";

const TEMPLATES: Array<{
  name: string;
  stage: string;
  subject: string;
}> = [
  {
    name: "stage1_form_link",
    stage: "stage1_sent",
    subject: "Next step for your {RoleName} application at {OrgName}",
  },
  {
    name: "stage2_interview_invite",
    stage: "stage2_invited",
    subject: "Interview invitation — {RoleName} at {OrgName}",
  },
  {
    name: "rejection",
    stage: "rejected",
    subject: "Update on your {RoleName} application at {OrgName}",
  },
  {
    name: "reminder_followup",
    stage: "reminder_sent",
    subject: "Reminder: complete your {RoleName} screening form",
  },
];

const STAGES: Array<{
  id: string;
  label: string;
  position: number;
  triggers_email: boolean;
  template_name: string | null;
}> = [
  { id: "new", label: "New", position: 1, triggers_email: false, template_name: null },
  {
    id: "stage1_sent",
    label: "Stage-1 Sent",
    position: 2,
    triggers_email: true,
    template_name: "stage1_form_link",
  },
  {
    id: "stage1_submitted",
    label: "Stage-1 Submitted",
    position: 3,
    triggers_email: false,
    template_name: null,
  },
  {
    id: "reminder_sent",
    label: "Reminder Sent",
    position: 4,
    triggers_email: true,
    template_name: "reminder_followup",
  },
  {
    id: "stage2_invited",
    label: "Stage-2 Invited",
    position: 5,
    triggers_email: true,
    template_name: "stage2_interview_invite",
  },
  {
    id: "stage2_confirmed",
    label: "Stage-2 Confirmed",
    position: 6,
    triggers_email: false,
    template_name: null,
  },
  {
    id: "interviewed",
    label: "Interviewed",
    position: 7,
    triggers_email: false,
    template_name: null,
  },
  { id: "hired", label: "Hired", position: 8, triggers_email: false, template_name: null },
  {
    id: "rejected",
    label: "Rejected",
    position: 9,
    triggers_email: true,
    template_name: "rejection",
  },
];

async function run() {
  const sql = postgres(url!, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log("Seeding email_templates …");
  for (const t of TEMPLATES) {
    await db
      .insert(schema.emailTemplates)
      .values({
        name: t.name,
        stage: t.stage,
        subject: t.subject,
        bodyHtml: TEMPLATE_PLACEHOLDER_HTML,
        bodyText: TEMPLATE_PLACEHOLDER_TEXT,
      })
      .onConflictDoNothing({ target: schema.emailTemplates.name });
  }

  const templatesByName = new Map(
    (await db.select().from(schema.emailTemplates)).map((t) => [t.name, t.id]),
  );

  console.log("Seeding stages …");
  for (const s of STAGES) {
    const templateId = s.template_name ? templatesByName.get(s.template_name) ?? null : null;
    const existing = await db
      .select()
      .from(schema.stages)
      .where(eq(schema.stages.id, s.id));

    if (existing.length === 0) {
      await db.insert(schema.stages).values({
        id: s.id,
        label: s.label,
        position: s.position,
        triggersEmail: s.triggers_email,
        templateId,
      });
    } else {
      await db
        .update(schema.stages)
        .set({
          label: s.label,
          position: s.position,
          triggersEmail: s.triggers_email,
          templateId,
        })
        .where(eq(schema.stages.id, s.id));
    }
  }

  await sql.end();
  console.log(`Seed complete: ${TEMPLATES.length} templates, ${STAGES.length} stages.`);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
