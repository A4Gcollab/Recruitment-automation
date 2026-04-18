const ORG_NAME = "Omysha Foundation";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderStage1(vars: {
  candidateFirstName: string;
  roleName: string;
  orgName?: string;
  formLink: string;
  deadline: string;
}): { subject: string; html: string; text: string } {
  const org = vars.orgName ?? ORG_NAME;
  const firstName = vars.candidateFirstName;

  const subject = `Next Step — Stage-1 Screening Form | ${vars.roleName} | ${org}`;

  const text = [
    `Dear ${firstName},`,
    "",
    `Thank you for your interest in the ${vars.roleName} role at ${org}.`,
    "",
    "As the next step in our selection process, shortlisted candidates are requested to complete the Stage-1 Screening Form within 24 hours of receiving this email:",
    "",
    `Google Form Link: ${vars.formLink}`,
    "",
    "Your responses will help us understand your alignment with the role. Based on the evaluation, selected candidates will be invited for an online interaction.",
    "",
    "Please note: only candidates who submit the form within the given timeline will be considered for the interview stage.",
    "",
    `Deadline: ${vars.deadline}`,
    "",
    "Warm regards,",
    `HR Team | ${org}`,
    "",
    "(If you did not apply for this role, please disregard this email.)",
  ].join("\n");

  const html = [
    `<p>Dear ${escapeHtml(firstName)},</p>`,
    `<p>Thank you for your interest in the <strong>${escapeHtml(vars.roleName)}</strong> role at <strong>${escapeHtml(org)}</strong>.</p>`,
    `<p>As the next step in our selection process, shortlisted candidates are requested to complete the Stage-1 Screening Form within 24 hours of receiving this email:</p>`,
    `<p><strong>Google Form Link:</strong> <a href="${escapeHtml(vars.formLink)}">${escapeHtml(vars.formLink)}</a></p>`,
    `<p>Your responses will help us understand your alignment with the role. Based on the evaluation, selected candidates will be invited for an online interaction.</p>`,
    `<p>Please note: only candidates who submit the form within the given timeline will be considered for the interview stage.</p>`,
    `<p><strong>Deadline:</strong> ${escapeHtml(vars.deadline)}</p>`,
    `<p>Warm regards,<br/>HR Team | ${escapeHtml(org)}</p>`,
    `<p style="color:#888;font-size:12px;">(If you did not apply for this role, please disregard this email.)</p>`,
  ].join("\n");

  return { subject, html, text };
}
