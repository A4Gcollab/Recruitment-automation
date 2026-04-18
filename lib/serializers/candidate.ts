import type { Candidate } from "@/lib/types";
import type { CandidateRow } from "@/db/schema";

export function serializeCandidate(row: CandidateRow): Candidate {
  return {
    id: row.id,
    full_name: row.fullName,
    email: row.email,
    linkedin_url: row.linkedinUrl,
    headline: row.headline,
    location: row.location,
    application_date: row.applicationDate,
    campaign_id: row.campaignId,
    stage: row.stage,
    email_enriched: row.emailEnriched,
    notes: row.notes,
    google_sheet_row: row.googleSheetRow,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
