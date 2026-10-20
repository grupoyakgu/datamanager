-- Individually status-tracked action items, derived from each summary's
-- AI-extracted action_items text list but tracked as their own rows so each
-- one can carry a status (open / in_process / closed) independent of the
-- others. Populated by lib/summaries/action-items.ts's syncActionItems,
-- called from processSummary and from manual edits — additive only (never
-- auto-deleted), so a status set by a user is never silently lost.

CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL REFERENCES meeting_summaries(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_process', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_items_summary_id ON action_items (summary_id);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items (status);

DROP TRIGGER IF EXISTS action_items_set_updated_at ON action_items;
CREATE TRIGGER action_items_set_updated_at BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_items_select_all ON action_items;
CREATE POLICY action_items_select_all ON action_items FOR SELECT TO authenticated USING (true);
