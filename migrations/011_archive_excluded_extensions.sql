-- 011: Admin-editable list of attachment file extensions that should never
-- be archived (e.g. inline signature images), starting with png.
INSERT INTO app_settings (key, value) VALUES
  ('archive_excluded_extensions', '["png"]')
ON CONFLICT (key) DO NOTHING;
