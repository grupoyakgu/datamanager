-- 004: Drive attachments, ambiguous-tag review flag, and a pinned Drive writer account.

ALTER TABLE meeting_summaries
  ADD COLUMN IF NOT EXISTS drive_file_suffix TEXT,
  ADD COLUMN IF NOT EXISTS needs_folder_review BOOLEAN NOT NULL DEFAULT FALSE;

-- Metadata for each Gmail attachment on a summary's source email. The bytes
-- themselves are fetched from Gmail on demand (at export time) using
-- ingested_by's own Gmail access, then uploaded to the single shared Drive.
CREATE TABLE IF NOT EXISTS summary_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL REFERENCES meeting_summaries(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_attachment_id TEXT NOT NULL,
  ingested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  drive_file_id TEXT,
  drive_synced_at TIMESTAMPTZ,
  drive_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (summary_id, gmail_attachment_id)
);
CREATE INDEX IF NOT EXISTS idx_summary_attachments_summary_id ON summary_attachments (summary_id);
ALTER TABLE summary_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS summary_attachments_select_all ON summary_attachments;
CREATE POLICY summary_attachments_select_all ON summary_attachments FOR SELECT TO authenticated USING (true);

INSERT INTO app_settings (key, value) VALUES
  ('drive_writer_email', '"koby@grupoyakgu.es"')
ON CONFLICT (key) DO NOTHING;
