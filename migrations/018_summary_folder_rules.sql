-- 018: Admin-manageable rules that give a summary's auto-created sender-domain
-- Drive folder a friendlier display name (and let an exact email override a
-- domain rule), mirroring archive_folder_rules (013) for the Summaries module.
CREATE TABLE IF NOT EXISTS summary_folder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL UNIQUE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('email', 'domain')),
  drive_folder_id TEXT NOT NULL,
  drive_folder_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_summary_folder_rules_pattern ON summary_folder_rules (pattern);

ALTER TABLE summary_folder_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS summary_folder_rules_select_all ON summary_folder_rules;
CREATE POLICY summary_folder_rules_select_all ON summary_folder_rules FOR SELECT TO authenticated USING (true);
