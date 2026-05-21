// Default email template strings seeded into the `campaigns` table on creation
// (and backfilled into existing campaign rows by migration 0002_v2.2_bulk_ops).
//
// These are the v0.2 per-campaign editable templates. HR can override any of
// them at campaign-create time. Merge fields:
//
//   Stage-1   : {{name}}, {{form_link}}, {{deadline}}
//   Reminder  : {{name}}, {{form_link}}, {{deadline}}
//   Interview : {{name}}, {{interview_date}}, {{interview_time}},
//               {{zoom_link}}, {{zoom_meeting_id}}, {{zoom_passcode}}
//
// Stage-1 text adapted from PRD v2.1 §6.2.2 with merge-field syntax updated.

export const DEFAULT_STAGE1_SUBJECT =
  "Next Step — Stage-1 Screening Form";

export const DEFAULT_STAGE1_BODY = `Dear {{name}},

Thank you for your interest in the role at our organization.

As the next step in our selection process, please complete the Stage-1 Screening Form within 24 hours of receiving this email:

{{form_link}}

Your responses will help us understand your alignment with the role. Based on the evaluation, selected candidates will be invited for an online interaction.

Please note: only candidates who submit the form within the given timeline will be considered for the interview stage.

Deadline: {{deadline}}

Warm regards,
HR Team

(If you did not apply for this role, please disregard this email.)`;

export const DEFAULT_REMINDER_SUBJECT =
  "Reminder — Stage-1 Screening Form still pending";

export const DEFAULT_REMINDER_BODY = `Hi {{name}},

This is a gentle reminder to complete the Stage-1 Screening Form for the role you applied to:

{{form_link}}

We have not received your submission yet. The deadline is {{deadline}} — only candidates who submit by then can move to the interview stage.

If you have already submitted the form, please ignore this message.

Warm regards,
HR Team`;

export const DEFAULT_INTERVIEW_SUBJECT =
  "Interview Invitation — Next Round";

export const DEFAULT_INTERVIEW_BODY = `Dear {{name}},

Congratulations — you have been shortlisted for an interview based on your Stage-1 responses.

Interview details:
- Date: {{interview_date}}
- Time: {{interview_time}}
- Zoom link: {{zoom_link}}
- Meeting ID: {{zoom_meeting_id}}
- Passcode: {{zoom_passcode}}

Please confirm your availability by replying to this email.

Warm regards,
HR Team`;

export const DEFAULT_REMINDER_AFTER_DAYS = 3;
