-- Summaries redesign: ingestion moves from per-user Gmail inbox scanning to
-- emails sent/forwarded to repo@grupoyakgu.es WITHOUT attachments (mirrors
-- the Archive module, which handles the WITH-attachments case); Drive export
-- moves from tag-based Google Docs in an admin's personal Drive to real
-- .docx files, organized by sender domain, in repo@grupoyakgu.es's own
-- Drive under a "summaries" folder.

ALTER TABLE meeting_summaries
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS hebrew_translation TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_name TEXT,
  ADD COLUMN IF NOT EXISTS is_forward BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS original_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS original_sender_email TEXT,
  ADD COLUMN IF NOT EXISTS forwarded_by_name TEXT,
  ADD COLUMN IF NOT EXISTS forwarded_by_email TEXT,
  ADD COLUMN IF NOT EXISTS ingested_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Tag-based Drive foldering is gone (replaced by sender-domain foldering,
-- see drive_folder_name above), so these are no longer meaningful.
ALTER TABLE meeting_summaries
  DROP COLUMN IF EXISTS drive_folder_override,
  DROP COLUMN IF EXISTS drive_folder_tag_id,
  DROP COLUMN IF EXISTS needs_folder_review,
  DROP COLUMN IF EXISTS drive_file_suffix;
