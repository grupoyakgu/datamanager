-- 010: Content-based tags (reusing the existing shared `tags` table) and
-- user comments on archived items.

CREATE TABLE IF NOT EXISTS archive_item_tags (
  archived_item_id UUID NOT NULL REFERENCES archived_items(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (archived_item_id, tag_id)
);
ALTER TABLE archive_item_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_item_tags_select_all ON archive_item_tags;
CREATE POLICY archive_item_tags_select_all ON archive_item_tags FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS archive_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_item_id UUID NOT NULL REFERENCES archived_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_archive_comments_item_id ON archive_comments (archived_item_id);
ALTER TABLE archive_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_comments_select_all ON archive_comments;
CREATE POLICY archive_comments_select_all ON archive_comments FOR SELECT TO authenticated USING (true);
