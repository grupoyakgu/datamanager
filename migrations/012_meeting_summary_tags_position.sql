-- 012: Persist the order tags were assigned in (AI relevance order for
-- AI-detected tags, insertion order for manual edits), so the summary's
-- Drive folder can be based on the single most relevant/primary tag
-- instead of an alphabetical accident.
ALTER TABLE meeting_summary_tags
  ADD COLUMN IF NOT EXISTS position INTEGER;
