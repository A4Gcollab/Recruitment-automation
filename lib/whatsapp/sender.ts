import "server-only";

export type WhatsAppSendResult =
  | { sent: true; messageId: string }
  | { sent: false; error: string };

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN env vars");
  }

  return { phoneNumberId, token };
}

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export async function sendWhatsAppTemplate(args: {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: Array<{
    type: "body" | "header" | "button";
    parameters: Array<{ type: "text"; text: string }>;
  }>;
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId, token } = getConfig();
  const { to, templateName, languageCode = "en", components } = args;

  if (process.env.KILL_SWITCH_WHATSAPP === "true") {
    return { sent: false, error: "WhatsApp kill switch active" };
  }

  const phone = normalizePhone(to);
  if (!phone) {
    return { sent: false, error: `Invalid phone number: ${to}` };
  }

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const data = await res.json();

    if (res.ok && data.messages?.[0]?.id) {
      return { sent: true, messageId: data.messages[0].id };
    }

    const errMsg = data.error?.message ?? JSON.stringify(data);
    return { sent: false, error: errMsg };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendWhatsAppText(args: {
  to: string;
  text: string;
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId, token } = getConfig();
  const phone = normalizePhone(args.to);

  if (!phone) {
    return { sent: false, error: `Invalid phone number: ${args.to}` };
  }

  if (process.env.KILL_SWITCH_WHATSAPP === "true") {
    return { sent: false, error: "WhatsApp kill switch active" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: args.text },
        }),
      },
    );

    const data = await res.json();

    if (res.ok && data.messages?.[0]?.id) {
      return { sent: true, messageId: data.messages[0].id };
    }

    const errMsg = data.error?.message ?? JSON.stringify(data);
    return { sent: false, error: errMsg };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Normalize Indian phone numbers to E.164 format (no + prefix, as Meta requires).
// Handles scientific notation from Excel (e.g. "9.17588E+11"), double-prefix (+91+91),
// and standard formats.
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  let input = phone.trim();

  // Handle Excel scientific notation: "9.17588E+11" -> "917588000000"
  // Note: precision may be lost for numbers stored this way — best effort.
  if (/^\d+\.?\d*[eE][+\-]?\d+$/.test(input)) {
    const num = parseFloat(input);
    if (!isNaN(num) && isFinite(num)) {
      input = Math.round(num).toString();
    }
  }

  // Strip all formatting: spaces, dashes, parens, but keep leading + for prefix detection
  const stripped = input.replace(/[\s\-().]/g, "");

  // Handle double-prefix: "+91+91XXXXXXXXXX" or "9191XXXXXXXXXX"
  if (/^\+?91\+?91\d{10}$/.test(stripped)) {
    return `91${stripped.replace(/\+/g, "").slice(-10)}`;
  }

  const digits = stripped.replace(/\+/g, "");

  if (/^91\d{10}$/.test(digits)) return digits;           // 919XXXXXXXXX
  if (/^0\d{10}$/.test(digits)) return `91${digits.slice(1)}`; // 0XXXXXXXXXX
  if (/^\d{10}$/.test(digits)) return `91${digits}`;     // 10-digit
  // 13-digit: likely extra leading digit — try stripping first digit if remainder is valid
  if (/^\d{13}$/.test(digits) && digits.startsWith("91")) return digits.slice(0, 12);

  return null;
}
