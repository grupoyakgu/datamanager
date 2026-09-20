-- 009: Track whether an archived item's source email was successfully moved
-- to Trash, so a sync can retry it (e.g. after the OAuth scope needed for
-- trashing — gmail.modify — was only granted on a later re-connection).
ALTER TABLE archived_items
  ADD COLUMN IF NOT EXISTS source_trashed BOOLEAN NOT NULL DEFAULT FALSE;
