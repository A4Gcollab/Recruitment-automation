import { NextResponse } from "next/server";
import { and, count, desc, eq, gte, isNotNull, isNull, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { candidates } from "@/db/schema";
import { ERR } from "@/lib/api/response";
import { withAuth } from "@/lib/api/withAuth";
import { serializeCandidate } from "@/lib/serializers/candidate";
import type { CandidatesListResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  campaign_id: z.string().uuid().optional(),
  stage: z.string().min(1).max(100).optional(),
  role: z.string().min(1).max(255).optional(),
  has_email: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  date_from: z.string().datetime({ offset: true }).optional(),
  date_to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return ERR.validation({ issues: parsed.error.flatten() });
  }

  const q = parsed.data;
  const filters: SQL[] = [];
  if (q.campaign_id) filters.push(eq(candidates.campaignId, q.campaign_id));
  if (q.stage) filters.push(eq(candidates.stage, q.stage));
  if (q.role) filters.push(eq(candidates.role, q.role));
  if (q.has_email === true) filters.push(isNotNull(candidates.email));
  if (q.has_email === false) filters.push(isNull(candidates.email));
  if (q.date_from) filters.push(gte(candidates.createdAt, new Date(q.date_from)));
  if (q.date_to) filters.push(lte(candidates.createdAt, new Date(q.date_to)));

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (q.page - 1) * q.page_size;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(candidates)
      .where(where)
      .orderBy(desc(candidates.createdAt), desc(candidates.id))
      .limit(q.page_size)
      .offset(offset),
    db.select({ value: count() }).from(candidates).where(where),
  ]);

  const body: CandidatesListResponse = {
    items: rows.map(serializeCandidate),
    total: totalRow[0]?.value ?? 0,
    page: q.page,
    page_size: q.page_size,
  };

  return NextResponse.json(body);
});
