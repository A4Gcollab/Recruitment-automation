import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse<ApiError> {
  const body: ApiError = { error: { code, message } };
  if (details) body.error.details = details;
  return NextResponse.json(body, { status });
}

export const ERR = {
  unauthorized: () => jsonError(401, "unauthorized", "Sign-in required"),
  validation: (details?: Record<string, unknown>) =>
    jsonError(400, "validation_error", "Request payload failed validation", details),
  notFound: (what: string) => jsonError(404, "not_found", `${what} not found`),
  campaignNotFound: () =>
    jsonError(400, "campaign_not_found", "Unknown campaign_id — create the campaign first"),
  candidateNotFound: () =>
    jsonError(400, "candidate_not_found", "Unknown candidate_id"),
  alreadySent: (msg = "Already queued/sent for today") =>
    jsonError(400, "already_sent", msg),
  killSwitch: () =>
    jsonError(400, "kill_switch_active", "Email kill switch is active"),
  sheetUnreachable: (msg: string) =>
    jsonError(400, "sheet_unreachable", msg),
  sheetUpstream: (msg: string) =>
    jsonError(502, "sheet_upstream_error", msg),
  internal: (msg = "Unexpected server error") =>
    jsonError(500, "internal_error", msg),
};
