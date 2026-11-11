-- Archive redesign: project-based folder hierarchy (project > sender-domain subfolder), AI-generated metadata kept separate from manually-declared tags, content-hash dedup, and a public "assign project" magic link for items with no project tag.
CREATE TABLE IF NOT EXISTS archive_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  drive_folder_id TEXT NOT NULL,
  drive_folder_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE archive_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_projects_select_all ON archive_projects;
CREATE POLICY archive_projects_select_all ON archive_projects FOR SELECT TO authenticated USING (true);
CREATE TABLE IF NOT EXISTS archive_sender_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  folder_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE archive_sender_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_sender_domains_select_all ON archive_sender_domains;
CREATE POLICY archive_sender_domains_select_all ON archive_sender_domains FOR SELECT TO authenticated USING (true);
INSERT INTO archive_sender_domains (domain, folder_name) VALUES
  ('cm4arquitectos.com', 'cm4arquitectos'),
  ('rzs.es', 'RZS'),
  ('sinver.es', 'Sinver'),
  ('grupoyakgu.es', 'grupoyakgu')
ON CONFLICT (domain) DO NOTHING;
ALTER TABLE archived_items ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES archive_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_archived_items_project_id ON archived_items (project_id);
CREATE TABLE IF NOT EXISTS archive_ai_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_item_id UUID NOT NULL UNIQUE REFERENCES archived_items(id) ON DELETE CASCADE,
  document_type TEXT,
  topic TEXT,
  people TEXT[] NOT NULL DEFAULT '{}',
  companies TEXT[] NOT NULL DEFAULT '{}',
  document_date DATE,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  model TEXT,
  ai_error TEXT,
  raw JSONB,
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE archive_ai_metadata ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_ai_metadata_select_all ON archive_ai_metadata;
CREATE POLICY archive_ai_metadata_select_all ON archive_ai_metadata FOR SELECT TO authenticated USING (true);
ALTER TABLE archive_attachments ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_archive_attachments_content_hash ON archive_attachments (content_hash);
CREATE TABLE IF NOT EXISTS archive_review_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_item_id UUID NOT NULL REFERENCES archived_items(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_archive_review_tokens_token ON archive_review_tokens (token);
ALTER TABLE archive_review_tokens ENABLE ROW LEVEL SECURITY;
