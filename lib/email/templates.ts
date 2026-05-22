const ORG_NAME = "Omysha Foundation";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Substitute {{key}} placeholders in a template string. Whitespace inside the
// braces is allowed: {{name}}, {{ name }}, {{  role_name  }} all work.
function substituteMergeFields(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    result = result.replace(pattern, value);
  }
  return result;
}

// Convert plain-text template body to HTML: escape, linkify URLs, preserve newlines.
function plainTextBodyToHtml(text: string): string {
  const escaped = escapeHtml(text);
  // Linkify http(s) URLs. Stop at whitespace, common trailing punctuation, or '<'.
  const linkified = escaped.replace(
    /(https?:\/\/[^\s<]+?)([.,;!?)\]]*)(\s|<|$)/g,
    (_m, url: string, trail: string, end: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}${end}`,
  );
  // Preserve paragraph breaks: blank line → </p><p>, single newline → <br>.
  const paragraphs = linkified.split(/\n{2,}/).map((p) => p.replace(/\n/g, "<br>"));
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #222;">` +
    paragraphs.map((p) => `<p style="margin: 0 0 1em 0;">${p}</p>`).join("\n") +
    `</div>`;
}

export function renderStage1(vars: {
  candidateFirstName: string;
  roleName: string;
  orgName?: string;
  formLink: string;
  deadline: string;
  // v2.2: per-campaign templates. When present, these override the legacy hardcoded
  // default below. Backend stores these on the campaigns row (`stage1_subject` /
  // `stage1_body`); the cron passes them through. HR's custom copy is used verbatim
  // except for {{merge_field}} substitution.
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
}): { subject: string; html: string; text: string } {
  const org = vars.orgName ?? ORG_NAME;
  const firstName = vars.candidateFirstName;

  const mergeVars: Record<string, string> = {
    name: firstName,
    candidate_first_name: firstName,
    role_name: vars.roleName,
    form_link: vars.formLink,
    deadline: vars.deadline,
    org_name: org,
    organization: org,
  };

  // ── v2.2 path: use per-campaign template if provided ──────────────────────
  if (vars.subjectTemplate && vars.subjectTemplate.trim() && vars.bodyTemplate && vars.bodyTemplate.trim()) {
    const subject = substituteMergeFields(vars.subjectTemplate, mergeVars);
    const text = substituteMergeFields(vars.bodyTemplate, mergeVars);
    const html = plainTextBodyToHtml(text);
    return { subject, html, text };
  }

  // ── v0.1 fallback: hardcoded default (kept for safety only) ───────────────
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
