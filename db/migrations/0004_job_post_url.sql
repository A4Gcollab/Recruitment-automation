-- v0.4 — add job_post_url to campaigns for WhatsApp template {{4}}
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS job_post_url text;
