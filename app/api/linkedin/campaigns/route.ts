import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated by LINKEDIN_SYNC_KEY (Bearer token) — used by the Chrome
// extension to fetch the campaign list for the dropdown. Does NOT require a
// NextAuth session so the extension does not need cookies or a login.

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const key = process.env.LINKEDIN_SYNC_KEY;
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!key || auth !== key) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid or missing LINKEDIN_SYNC_KEY" } },
      { status: 401, headers: corsHeaders() },
    );
  }

  const rows = await db
    .select({ id: campaigns.id, roleName: campaigns.roleName, status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.status, "active"))
    .orderBy(campaigns.createdAt);

  return NextResponse.json(
    { campaigns: rows.map((r) => ({ id: r.id, name: r.roleName })) },
    { headers: corsHeaders() },
  );
}
