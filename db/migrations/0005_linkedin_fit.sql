-- v0.4: add linkedin_fit column to candidates
-- Stores LinkedIn's Good Fit / Disqualified rating per candidate
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin_fit varchar(50);
CREATE INDEX IF NOT EXISTS candidates_linkedin_fit_idx ON candidates(campaign_id, linkedin_fit);
