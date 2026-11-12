-- Admin-configurable categories for AI classification of archived emails — applied as ordinary tags (archive_item_tags) alongside whatever the sender/uploader already declared, not a separate field.
CREATE TABLE IF NOT EXISTS archive_classification_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE archive_classification_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS archive_classification_categories_select_all ON archive_classification_categories;
CREATE POLICY archive_classification_categories_select_all ON archive_classification_categories FOR SELECT TO authenticated USING (true);
INSERT INTO archive_classification_categories (name) VALUES
  ('Plans'), ('Payments'), ('Municipality'), ('Taxes'), ('Meeting summaries'), ('Site visit report'), ('Contracts'), ('Arras'), ('Compraventa')
ON CONFLICT (name) DO NOTHING;
ALTER TABLE archived_items ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_archived_items_classified_at ON archived_items (classified_at);
