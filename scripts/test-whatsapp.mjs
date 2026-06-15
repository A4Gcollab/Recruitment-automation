import { readFileSync } from "fs";

// Load .env.local manually
const envFile = readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envFile.split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
const token = env.WHATSAPP_ACCESS_TOKEN;
const recipient = env.WHATSAPP_TEST_RECIPIENT;

if (!phoneNumberId || !token || !recipient) {
  console.error("Missing WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, or WHATSAPP_TEST_RECIPIENT in .env.local");
  process.exit(1);
}

console.log(`Sending test message to +${recipient} from phone number ID ${phoneNumberId}...`);

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
      to: recipient,
      type: "text",
      text: {
        body: "Hey! This is a test message from A4G Recruitment dashboard. If you received this, WhatsApp integration is working! 🎉",
      },
    }),
  }
);

const data = await res.json();

if (res.ok) {
  console.log("✅ Message sent successfully!");
  console.log("Message ID:", data.messages?.[0]?.id);
} else {
  console.error("❌ Failed to send:", JSON.stringify(data, null, 2));
}
