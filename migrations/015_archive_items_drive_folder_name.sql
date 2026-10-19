-- 015: Cache the display name of the Drive folder an archived item's
-- attachments were resolved into (see resolveArchiveFolderId), so it can be
-- shown as a "Folder" column without an extra Drive API call per row.
ALTER TABLE archived_items ADD COLUMN IF NOT EXISTS drive_folder_name TEXT;
