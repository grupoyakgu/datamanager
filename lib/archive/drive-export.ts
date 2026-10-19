import { getSupabaseAdmin } from '@/lib/supabase';
import { deleteFile, renameFile, uploadFile } from '@/lib/google/drive';
import { getAttachmentData } from '@/lib/google/gmail';
import { splitExtension } from '@/lib/summaries/drive-export';
import { resolveArchiveFolderId } from './folder-rules';

function attachmentDriveName(title: string, filename: string, suffix: string | null): string {
  const { base, ext } = splitExtension(filename);
  return suffix ? `${title} — ${base} ${suffix}${ext}` : `${title} — ${base}${ext}`;
}

/**
 * Upload every not-yet-synced attachment of an archived item into whichever
 * Drive folder the admin-managed sender/domain rules pick for the original
 * sender — or a newly auto-created one (see folder-rules.ts) — using the
 * Archive mailbox's OWN Google connection (`ingestedBy`) for both reading
 * the attachment bytes from Gmail and writing them to Drive, so every file
 * actually lives in repo@grupoyakgu.es's own Drive. Best-effort per
 * attachment: one failure doesn't block the others.
 */
export async function exportArchiveAttachments(archivedItemId: string, ingestedBy: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  const [{ data: item }, { data: attachmentRows }] = await Promise.all([
    supabaseAdmin
      .from('archived_items')
      .select('title, drive_file_suffix, original_sender_email')
      .eq('id', archivedItemId)
      .maybeSingle(),
    supabaseAdmin
      .from('archive_attachments')
      .select('id, gmail_message_id, gmail_attachment_id, filename, mime_type, drive_file_id')
      .eq('archived_item_id', archivedItemId)
      .is('drive_file_id', null),
  ]);
  const attachments = attachmentRows ?? [];
  if (attachments.length === 0 || !item) return;

  const folderId = await resolveArchiveFolderId(ingestedBy, item.original_sender_email);
  let suffix = item.drive_file_suffix ?? null;
  if (!suffix) {
    suffix = String(Math.floor(1000 + Math.random() * 9000));
    await supabaseAdmin.from('archived_items').update({ drive_file_suffix: suffix }).eq('id', archivedItemId);
  }

  for (const attachment of attachments) {
    try {
      const name = attachmentDriveName(item.title, attachment.filename, suffix);
      const data = await getAttachmentData(ingestedBy, attachment.gmail_message_id, attachment.gmail_attachment_id);
      const uploaded = await uploadFile(ingestedBy, {
        name,
        mimeType: attachment.mime_type,
        parents: [folderId],
        data,
      });
      await supabaseAdmin
        .from('archive_attachments')
        .update({ drive_file_id: uploaded.id, drive_synced_at: new Date().toISOString(), drive_sync_error: null })
        .eq('id', attachment.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to export archive attachment', attachment.filename, 'for item', archivedItemId, error);
      await supabaseAdmin.from('archive_attachments').update({ drive_sync_error: message.slice(0, 500) }).eq('id', attachment.id);
      await supabaseAdmin.from('archived_items').update({ drive_sync_error: message.slice(0, 500) }).eq('id', archivedItemId);
    }
  }
}

/**
 * Rename an archived item's already-synced Drive files to match its new
 * title, using the item's own `ingested_by` account (repo@grupoyakgu.es)
 * since that's the account that actually owns these files. Best-effort.
 */
export async function renameArchiveDriveFiles(archivedItemId: string, newTitle: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: item }, { data: attachmentRows }] = await Promise.all([
    supabaseAdmin.from('archived_items').select('drive_file_suffix, ingested_by').eq('id', archivedItemId).maybeSingle(),
    supabaseAdmin
      .from('archive_attachments')
      .select('id, filename, drive_file_id')
      .eq('archived_item_id', archivedItemId)
      .not('drive_file_id', 'is', null),
  ]);
  if (!item?.ingested_by) return;

  for (const attachment of attachmentRows ?? []) {
    if (!attachment.drive_file_id) continue;
    try {
      const name = attachmentDriveName(newTitle, attachment.filename, item.drive_file_suffix ?? null);
      await renameFile(item.ingested_by, attachment.drive_file_id, name);
    } catch (error) {
      console.error('Failed to rename archive Drive file', attachment.drive_file_id, 'for item', archivedItemId, error);
    }
  }
}

/**
 * Remove an archived item's attachment files from Drive, using the item's
 * own `ingested_by` account since that's the account that actually owns
 * these files. Best-effort.
 */
export async function deleteArchiveItemFromDrive(archivedItemId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: item }, { data: attachmentRows }] = await Promise.all([
    supabaseAdmin.from('archived_items').select('ingested_by').eq('id', archivedItemId).maybeSingle(),
    supabaseAdmin.from('archive_attachments').select('drive_file_id').eq('archived_item_id', archivedItemId),
  ]);
  if (!item?.ingested_by) return;

  const fileIds = (attachmentRows ?? []).map((a) => a.drive_file_id).filter((id): id is string => !!id);
  for (const fileId of fileIds) {
    try {
      await deleteFile(item.ingested_by, fileId);
    } catch (error) {
      console.error('Failed to delete archive Drive file', fileId, 'for item', archivedItemId, error);
    }
  }
}
