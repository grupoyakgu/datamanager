-- The tag that currently determines a summary's Drive folder, kept "sticky"
-- across tag edits: adding another tag while keeping this one selected must
-- not move the Drive doc. Only when this tag is deselected does the folder
-- get recomputed (from the remaining tags) and the doc actually moved.
-- Ignored while drive_folder_override is set.
ALTER TABLE meeting_summaries
  ADD COLUMN IF NOT EXISTS drive_folder_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL;

-- Backfill: preserve today's Drive placement by pinning each already-tagged
-- summary to its current alphabetically-first tag, so the next tag edit
-- doesn't unexpectedly move it.
UPDATE meeting_summaries ms
SET drive_folder_tag_id = ft.tag_id
FROM (
  SELECT DISTINCT ON (mst.summary_id) mst.summary_id, mst.tag_id
  FROM meeting_summary_tags mst
  JOIN tags t ON t.id = mst.tag_id
  ORDER BY mst.summary_id, t.name ASC
) ft
WHERE ft.summary_id = ms.id
  AND ms.drive_folder_tag_id IS NULL;
