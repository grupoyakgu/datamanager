-- 002: Knowledge Hub data model extensions
-- Adds Google connections, folder rules, favorites, settings, embeddings,
-- full-text search, updated_at triggers, auth user sync and RLS policies.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Settings (key/value, admin editable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
  ('admin_emails', '["koby@grupoyakgu.es"]'),
  ('summary_keywords', '["סיכום", "summary", "resumen"]'),
  ('sync_lookback_days', '30'),
  ('completeness_weights', '{"meeting_date": 25, "participants": 25, "topics": 15, "tags": 15, "companies": 10, "decisions_or_actions": 10}'),
  ('extraction_fields', '["meeting_date", "meeting_time", "participants", "companies", "topics", "action_items", "decisions", "tags"]'),
  ('drive_root_folder_id', '"root"')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS gmail_status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (gmail_status IN ('disconnected', 'connected', 'authorization_required'));

ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN last_gmail_sync TYPE TIMESTAMPTZ;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Keep public.users in sync with auth.users (Google sign-in)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_list JSONB;
  user_role TEXT := 'user';
BEGIN
  SELECT value INTO admin_list FROM app_settings WHERE key = 'admin_emails';
  IF admin_list IS NOT NULL AND admin_list ? lower(NEW.email) THEN
    user_role := 'admin';
  END IF;

  INSERT INTO public.users (id, email, name, avatar_url, role)
  VALUES (
    NEW.id,
    lower(NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public.users.name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Google connections (Gmail read-only / send, Drive read-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_connections (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'authorization_required')),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS google_connections_set_updated_at ON google_connections;
CREATE TRIGGER google_connections_set_updated_at BEFORE UPDATE ON google_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Folders and folder rules
-- ---------------------------------------------------------------------------
ALTER TABLE folders ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE folders ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
DROP TRIGGER IF EXISTS folders_set_updated_at ON folders;
CREATE TRIGGER folders_set_updated_at BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Only one default folder
CREATE UNIQUE INDEX IF NOT EXISTS folders_single_default ON folders (is_default) WHERE is_default;

CREATE TABLE IF NOT EXISTS folder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id UUID NOT NULL UNIQUE REFERENCES tags(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE folder_rules ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
ALTER TABLE tags ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE tags ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
DROP TRIGGER IF EXISTS tags_set_updated_at ON tags;
CREATE TRIGGER tags_set_updated_at BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Meeting summaries
-- ---------------------------------------------------------------------------
ALTER TABLE meeting_summaries
  ADD COLUMN IF NOT EXISTS gmail_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_from TEXT,
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processed', 'failed')),
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536),
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED;

ALTER TABLE meeting_summaries ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE meeting_summaries ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
DROP TRIGGER IF EXISTS meeting_summaries_set_updated_at ON meeting_summaries;
CREATE TRIGGER meeting_summaries_set_updated_at BEFORE UPDATE ON meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_meeting_summaries_search ON meeting_summaries USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_meeting_summaries_gmail_message_id ON meeting_summaries (gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_meeting_summaries_embedding ON meeting_summaries
  USING hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Extracted data
-- ---------------------------------------------------------------------------
ALTER TABLE extracted_data
  ADD COLUMN IF NOT EXISTS meeting_time TEXT,
  ADD COLUMN IF NOT EXISTS detected_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS raw JSONB;
ALTER TABLE extracted_data ALTER COLUMN extracted_at TYPE TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Favorites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_id UUID NOT NULL REFERENCES meeting_summaries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, summary_id)
);
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Semantic search RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_summaries(
  query_embedding extensions.vector(1536),
  match_count INT DEFAULT 20,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_folder_id UUID DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_participant TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, similarity FLOAT)
LANGUAGE sql STABLE AS $$
  SELECT ms.id, 1 - (ms.embedding <=> query_embedding) AS similarity
  FROM meeting_summaries ms
  LEFT JOIN extracted_data ed ON ed.summary_id = ms.id
  WHERE ms.embedding IS NOT NULL
    AND (p_date_from IS NULL OR ms.meeting_date >= p_date_from)
    AND (p_date_to IS NULL OR ms.meeting_date <= p_date_to)
    AND (p_folder_id IS NULL OR ms.folder_id = p_folder_id)
    AND (p_tag_ids IS NULL OR EXISTS (
      SELECT 1 FROM meeting_summary_tags mst
      WHERE mst.summary_id = ms.id AND mst.tag_id = ANY (p_tag_ids)))
    AND (p_participant IS NULL OR EXISTS (
      SELECT 1 FROM unnest(coalesce(ed.participants, '{}')) p
      WHERE p ILIKE '%' || p_participant || '%'))
  ORDER BY ms.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row level security (service role bypasses; these cover the anon client)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_self ON users;
CREATE POLICY users_select_self ON users FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS folders_select_all ON folders;
CREATE POLICY folders_select_all ON folders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tags_select_all ON tags;
CREATE POLICY tags_select_all ON tags FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS folder_rules_select_all ON folder_rules;
CREATE POLICY folder_rules_select_all ON folder_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS summaries_select_all ON meeting_summaries;
CREATE POLICY summaries_select_all ON meeting_summaries FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS summary_tags_select_all ON meeting_summary_tags;
CREATE POLICY summary_tags_select_all ON meeting_summary_tags FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS extracted_select_all ON extracted_data;
CREATE POLICY extracted_select_all ON extracted_data FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS favorites_own ON favorites;
CREATE POLICY favorites_own ON favorites FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Additional folders from the spec
INSERT INTO folders (name, "order") VALUES
  ('Beatriz de Suabia', 6),
  ('CM4', 7),
  ('ORVE', 8)
ON CONFLICT (name) DO NOTHING;
