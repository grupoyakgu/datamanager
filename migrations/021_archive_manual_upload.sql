-- Drag-and-drop desktop uploads create an archived_item too (so they get the same project/tags/search treatment as an emailed one), distinguished from email-derived items by this column, mirroring meeting_summaries.source.
ALTER TABLE archived_items ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'gmail' CHECK (source IN ('gmail', 'manual'));
