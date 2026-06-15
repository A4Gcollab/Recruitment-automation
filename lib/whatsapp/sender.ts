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

// Normalize Indian phone numbers to E.164 format (no + prefix, as Meta requires)
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/[\s\-()+"]/g, "");
  if (/^91\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `91${digits.slice(1)}`;
  if (/^\d{10}$/.test(digits)) return `91${digits}`;
  if (/^\+91\d{10}$/.test(phone.replace(/[\s\-()]/g, ""))) return digits;
  return null;
}
