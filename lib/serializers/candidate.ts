import type {
  Candidate,
  InterviewVerdict,
  Verdict,
} from "@/lib/types";
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

    // v0.2 fields
    phone: row.phone,
    current_title: row.currentTitle,
    current_company: row.currentCompany,
    school: row.school,
    resume_url: row.resumeUrl,
    applicantsync_score: row.applicantsyncScore,
    linkedin_data: row.linkedinData ?? {},
    verdict: (row.verdict as Verdict | null) ?? null,
    reason: row.reason,
    interview_verdict: (row.interviewVerdict as InterviewVerdict | null) ?? null,
    interview_reason: row.interviewReason,
    stage1_sent_at: row.stage1SentAt ? row.stage1SentAt.toISOString() : null,
    reminder_sent_at: row.reminderSentAt ? row.reminderSentAt.toISOString() : null,

    // v0.4 LinkedIn rating
    linkedin_fit: row.linkedinFit ?? null,

    // v0.3 WhatsApp fields
    wa_status: row.waStatus ?? null,
    wa_last_sent_at: row.waLastSentAt ? row.waLastSentAt.toISOString() : null,
    wa_last_reply: row.waLastReply ?? null,
    wa_last_reply_at: row.waLastReplyAt ? row.waLastReplyAt.toISOString() : null,
  };
}
