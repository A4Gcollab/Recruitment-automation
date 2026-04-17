import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let cachedTransport: Transporter | null = null;

function getEnv() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const senderName = process.env.GMAIL_SENDER_NAME ?? "A4G HR Team";

  if (!user || !pass) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars");
  }

  return { user, pass, senderName };
}

export function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport;

  const { user, pass } = getEnv();

  cachedTransport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  return cachedTransport;
}

export function getSenderAddress(): string {
  const { user, senderName } = getEnv();
  return `"${senderName}" <${user}>`;
}

export async function verifyConnection(): Promise<boolean> {
  try {
    const transport = getTransport();
    await transport.verify();
    return true;
  } catch {
    return false;
  }
}
