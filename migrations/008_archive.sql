-- 008: Archive module — a dedicated mailbox (archive@grupoyakgu.es) where any
-- forwarded (or direct) email becomes an archived item, its attachments
-- saved to one fixed Drive folder, tagged by its original sender.

INSERT INTO app_settings (key, value) VALUES
  ('archive_mailbox', '"archive@grupoyakgu.es"'),
  ('archive_drive_folder_id', '"1N0l2LXwvJZeOpiuPQ_3lnzXrM08WwkMt"'),
  ('archive_sync_lookback_days', '365')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS archived_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL DEFAULT '',
  original_sender_name TEXT,
  original_sender_email TEXT,
  forwarded_by_name TEXT,
  forwarded_by_email TEXT,
  is_forward BOOLEAN NOT NULL DEFAULT FALSE,
  gmail_message_id TEXT NOT NULL UNIQUE,
  message_id_header TEXT,
  email_received_at TIMESTAMPTZ,
  ingested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  drive_file_suffix TEXT,
  drive_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_archived_items_received_at ON archived_items (email_received_at DESC);
CREATE INDEX IF NOT EXISTS idx_archived_items_sender_email ON archived_items (original_sender_email);

DROP TRIGGER IF EXISTS archived_items_set_updated_at ON archived_items;
CREATE TRIGGER archived_items_set_updated_at BEFORE UPDATE ON archived_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS archive_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_item_id UUID NOT NULL REFERENCES archived_items(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_attachment_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  drive_file_id TEXT,
  drive_synced_at TIMESTAMPTZ,
  drive_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (archived_item_id, gmail_attachment_id)
);
CREATE INDEX IF NOT EXISTS idx_archive_attachments_item_id ON archive_attachments (archived_item_id);

ALTER TABLE archived_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archived_items_select_all ON archived_items;
CREATE POLICY archived_items_select_all ON archived_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS archive_attachments_select_all ON archive_attachments;
CREATE POLICY archive_attachments_select_all ON archive_attachments FOR SELECT TO authenticated USING (true);
