-- The exact Drive folder an item's attachments were uploaded/moved into —
-- previously only its display name (drive_folder_name) was stored, so the
-- Files page's "open in Drive" folder link had to fall back to the
-- project's own root folder, which is wrong whenever a sender-domain
-- subfolder (archive_sender_domain_folders) put the files one level deeper.
ALTER TABLE archived_items ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

-- Backfill: the sender-domain subfolder tracked for this item's
-- (sender domain, project) pair when one is configured, else the
-- project's own root folder — same resolution order as
-- resolveArchiveDestination, without needing to call Drive again.
UPDATE archived_items ai
SET drive_folder_id = sub.folder_id
FROM (
  SELECT ai2.id, COALESCE(sdf.drive_folder_id, p.drive_folder_id) AS folder_id
  FROM archived_items ai2
  JOIN archive_projects p ON p.id = ai2.project_id
  LEFT JOIN archive_sender_domains sd
    ON sd.domain = split_part(lower(ai2.original_sender_email), '@', 2)
  LEFT JOIN archive_sender_domain_folders sdf
    ON sdf.sender_domain_id = sd.id AND sdf.project_id = ai2.project_id
) sub
WHERE sub.id = ai.id
  AND ai.drive_folder_id IS NULL;
