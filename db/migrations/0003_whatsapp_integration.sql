-- 0003: WhatsApp integration — message log table + candidate WA status fields + WA queue table

-- WhatsApp message log (audit trail for every outbound/inbound message)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL DEFAULT 'outbound',  -- 'outbound' | 'inbound'
  wa_message_id VARCHAR(255),                          -- Meta's wamid.*
  template_name VARCHAR(100),                          -- null for free-form or inbound
  body TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'sent',          -- sent | delivered | read | failed
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_messages_candidate_idx ON whatsapp_messages(candidate_id);
CREATE INDEX whatsapp_messages_campaign_idx ON whatsapp_messages(campaign_id);
CREATE INDEX whatsapp_messages_wa_message_id_idx ON whatsapp_messages(wa_message_id);

-- WhatsApp send queue (mirrors email_queue pattern)
CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  template_name VARCHAR(100) NOT NULL,
  template_params JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',      -- pending | processing | sent | failed
  retry_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  wa_message_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_queue_pending_due_idx ON whatsapp_queue(scheduled_for)
  WHERE status = 'pending';
CREATE INDEX whatsapp_queue_candidate_idx ON whatsapp_queue(candidate_id);

-- Add WhatsApp status tracking to candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS wa_status VARCHAR(50);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS wa_last_sent_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS wa_last_reply TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS wa_last_reply_at TIMESTAMPTZ;
