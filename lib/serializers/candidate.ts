import type { Candidate } from "@/lib/types";
import type { Candidate as DbCandidate } from "@/db/schema";

export function serializeCandidate(row: DbCandidate): Candidate {
  return {
    id: row.id,
    full_name: row.fullName,
    email: row.email,
    linkedin_url: row.linkedinUrl,
    role: row.role,
    campaign_id: row.campaignId,
    stage: row.stage,
    email_enriched: row.emailEnriched,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
