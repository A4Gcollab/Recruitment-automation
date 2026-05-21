import type { Campaign } from "@/lib/types";
import type { CampaignRow } from "@/db/schema";

export function serializeCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    role_name: row.roleName,
    google_form_url: row.googleFormUrl,
    zoom_link: row.zoomLink,
    zoom_meeting_id: row.zoomMeetingId,
    zoom_passcode: row.zoomPasscode,
    interview_date: row.interviewDate,
    interview_time: row.interviewTime,
    interview_mode: row.interviewMode,
    status: row.status as Campaign["status"],
    created_at: row.createdAt.toISOString(),

    // v0.2 fields
    stage1_subject: row.stage1Subject,
    stage1_body: row.stage1Body,
    reminder_subject: row.reminderSubject,
    reminder_body: row.reminderBody,
    interview_subject: row.interviewSubject,
    interview_body: row.interviewBody,
    reminder_after_days: row.reminderAfterDays,
    form_response_sheet_url: row.formResponseSheetUrl,
  };
}
