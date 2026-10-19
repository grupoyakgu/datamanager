-- 013: Admin-manageable rules that route an archived item's attachments to a
-- specific Drive folder based on the original sender's email or domain,
-- instead of always using the single fixed archive_drive_folder_id.
CREATE TABLE IF NOT EXISTS archive_folder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL UNIQUE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('email', 'domain')),
  drive_folder_id TEXT NOT NULL,
  drive_folder_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_archive_folder_rules_pattern ON archive_folder_rules (pattern);

ALTER TABLE archive_folder_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_folder_rules_select_all ON archive_folder_rules;
CREATE POLICY archive_folder_rules_select_all ON archive_folder_rules FOR SELECT TO authenticated USING (true);
