-- 005: Manual Drive folder override, and a redefined meaning for
-- needs_folder_review (see lib/summaries/drive-export.ts):
--   - Folders now live directly under the configured Drive root — no more
--     nested "Data Manager/Summaries" path.
--   - A summary is filed under its first tag's folder (alphabetically),
--     or drive_folder_override when the user has manually chosen one.
--   - needs_folder_review now means "no tag yet, nothing to file under" —
--     previously it meant "multiple tags, ambiguous", which no longer
--     applies since a multi-tag summary just uses its first tag.

ALTER TABLE meeting_summaries
  ADD COLUMN IF NOT EXISTS drive_folder_override TEXT;
