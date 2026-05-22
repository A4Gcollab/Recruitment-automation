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
  "Next Step — Stage-1 Screening Form | {{role_name}} | Omysha Foundation-A4G & VONG";

export const DEFAULT_STAGE1_BODY = `Hey {{name}},
Thank you for your interest in the {{role_name}} role at Omysha Foundation- VONG & A4G.
As the next step in our selection process, shortlisted candidates are requested to complete the Stage-1 Screening Google Form within 24 hours of receiving this message:
Google Form Link: {{form_link}}
Your responses will help us understand alignment with the role. Based on the evaluation, selected candidates will be invited for an online interaction, and further details will be shared after assessment.
Please note that only candidates who submit the form within the given timeline will be considered for the interview stage.

This is the link to our A4G : https://www.a4gcollab.org/ & A4G LinkedIn page : https://www.linkedin.com/company/a4gcollab

This is the link to our VONG Movement: https://vong.earth/ & VONG LinkedIn page : https://www.linkedin.com/company/vong-earth/

Best regards,
 Team Omysha Foundation
 VONG Movement | AI for Good (A4G) Impact Collaborative`;

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
