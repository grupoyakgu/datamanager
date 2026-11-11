-- Tracks the actual Drive folder id created for each (sender domain, project) pair, so a later rename of the domain's display name can retarget the exact folder by id instead of re-finding it by its old name (which breaks once the name has already drifted once).
CREATE TABLE IF NOT EXISTS archive_sender_domain_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_domain_id UUID NOT NULL REFERENCES archive_sender_domains(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES archive_projects(id) ON DELETE CASCADE,
  drive_folder_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sender_domain_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_archive_sender_domain_folders_domain ON archive_sender_domain_folders (sender_domain_id);
ALTER TABLE archive_sender_domain_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_sender_domain_folders_select_all ON archive_sender_domain_folders;
CREATE POLICY archive_sender_domain_folders_select_all ON archive_sender_domain_folders FOR SELECT TO authenticated USING (true);
