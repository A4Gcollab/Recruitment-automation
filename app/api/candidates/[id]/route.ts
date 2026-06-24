import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { serializeCandidate } from "@/lib/serializers/candidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id));
  if (!row) return ERR.notFound("Candidate");
  return NextResponse.json(serializeCandidate(row));
});

const patchSchema = z.object({
  stage: z.string().min(1).max(100).optional(),
  linkedin_fit: z.string().max(50).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const PATCH = withAuth<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ERR.validation({ reason: "invalid JSON body" });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return ERR.validation({ issues: parsed.error.flatten() });

  const d = parsed.data;
  const updates: Partial<typeof candidates.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (d.stage !== undefined) updates.stage = d.stage;
  if (d.linkedin_fit !== undefined) updates.linkedinFit = d.linkedin_fit;
  if (d.notes !== undefined) updates.notes = d.notes;

  const [updated] = await db
    .update(candidates)
    .set(updates)
    .where(eq(candidates.id, id))
    .returning();

  if (!updated) return ERR.notFound("Candidate");
  return NextResponse.json(serializeCandidate(updated));
});
