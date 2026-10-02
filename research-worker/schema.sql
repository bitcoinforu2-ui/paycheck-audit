-- Rounded voluntary research submissions only. Never store original payslips or exact income.
CREATE TABLE IF NOT EXISTS research_contributions (
 receipt_hash TEXT PRIMARY KEY,
 consent_version INTEGER NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose = 'voluntary-peer-research'),
 created_at TEXT NOT NULL,
 sample TEXT NOT NULL CHECK(length(sample) <= 16000)
);
-- No public listing API: a separate protected analyst process must enforce
-- minimum cohort sizes and differential-privacy or disclosure rules.
