import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ERR } from "./response";

export type AuthedHandler<TCtx = unknown> = (
  req: NextRequest,
  ctx: TCtx,
  session: { actor: string },
) => Promise<NextResponse> | NextResponse;

export function withAuth<TCtx = unknown>(handler: AuthedHandler<TCtx>) {
  return async (req: NextRequest, ctx: TCtx) => {
    const session = await auth();
    if (!session?.user?.email) {
      return ERR.unauthorized();
    }
    return handler(req, ctx, { actor: session.user.email });
  };
}
