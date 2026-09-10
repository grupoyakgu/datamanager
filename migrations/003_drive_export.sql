-- 003: Track Google Drive export state for meeting summaries.
-- Summaries are exported as Google Docs under "Data Manager/Summaries",
-- with an additional Drive parent folder per tag (see lib/summaries/drive-export.ts).

ALTER TABLE meeting_summaries
  ADD COLUMN IF NOT EXISTS drive_doc_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drive_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_meeting_summaries_drive_doc_id ON meeting_summaries (drive_doc_id);
