-- D1 has no original PDF bytes, names, bank data, salary figures or OCR.
-- Only allowlisted diagnostic events and random device-side pseudonyms.
CREATE TABLE IF NOT EXISTS pilot_reports (
  report_id TEXT PRIMARY KEY NOT NULL,
  participant_id TEXT NOT NULL,
  delete_hash TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pilot_reports_created_at ON pilot_reports(created_at);
CREATE INDEX IF NOT EXISTS pilot_reports_participant_id ON pilot_reports(participant_id);
