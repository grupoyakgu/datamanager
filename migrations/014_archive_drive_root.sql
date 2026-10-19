-- 014: The Archive module's Drive root moves from the pinned Drive-writer
-- account's Drive to the Archive mailbox's own Drive (repo@grupoyakgu.es),
-- so received files live in, and are organized under, that one shared
-- mailbox's account rather than whichever admin happens to be configured as
-- drive_writer_email. The previously configured folder lived in a different
-- account's Drive and is unreachable from the mailbox's own token, so reset
-- to 'root' (its own My Drive) — a safe default that always exists.
UPDATE app_settings SET value = '"root"' WHERE key = 'archive_drive_folder_id';
