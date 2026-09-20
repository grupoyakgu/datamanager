import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { deleteFile, uploadFile } from '@/lib/google/drive';
import { getAttachmentData } from '@/lib/google/gmail';
import { getDriveWriter, splitExtension } from '@/lib/summaries/drive-export';

/**
 * Upload every not-yet-synced attachment of an archived item into the fixed
 * Archive Drive folder, using the same pinned Drive-writer account
 * (`getSettings().drive_writer_email`) that owns every other Drive write in
 * the app. The bytes themselves are fetched from Gmail using the Archive
 * mailbox's own connection (`ingestedBy`). Best-effort per attachment: one
 * failure doesn't block the others.
 */
export async function exportArchiveAttachments(archivedItemId: string, ingestedBy: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const writer = await getDriveWriter();
  if (!writer) return;

  const [{ data: item }, { data: attachmentRows }] = await Promise.all([
    supabaseAdmin.from('archived_items').select('drive_file_suffix').eq('id', archivedItemId).maybeSingle(),
    supabaseAdmin
      .from('archive_attachments')
      .select('id, gmail_message_id, gmail_attachment_id, filename, mime_type, drive_file_id')
      .eq('archived_item_id', archivedItemId)
      .is('drive_file_id', null),
  ]);
  const attachments = attachmentRows ?? [];
  if (attachments.length === 0) return;

  const settings = await getSettings();
  let suffix = item?.drive_file_suffix ?? null;
  if (!suffix) {
    suffix = String(Math.floor(1000 + Math.random() * 9000));
    await supabaseAdmin.from('archived_items').update({ drive_file_suffix: suffix }).eq('id', archivedItemId);
  }

  for (const attachment of attachments) {
    try {
      const { base, ext } = splitExtension(attachment.filename);
      const name = `${base} ${suffix}${ext}`;
      const data = await getAttachmentData(ingestedBy, attachment.gmail_message_id, attachment.gmail_attachment_id);
      const uploaded = await uploadFile(writer.id, {
        name,
        mimeType: attachment.mime_type,
        parents: [settings.archive_drive_folder_id],
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

/** Remove an archived item's attachment files from Drive. Best-effort. */
export async function deleteArchiveItemFromDrive(archivedItemId: string): Promise<void> {
  const writer = await getDriveWriter();
  if (!writer) return;
  const { data: attachmentRows } = await getSupabaseAdmin()
    .from('archive_attachments')
    .select('drive_file_id')
    .eq('archived_item_id', archivedItemId);
  const fileIds = (attachmentRows ?? []).map((a) => a.drive_file_id).filter((id): id is string => !!id);
  for (const fileId of fileIds) {
    try {
      await deleteFile(writer.id, fileId);
    } catch (error) {
      console.error('Failed to delete archive Drive file', fileId, 'for item', archivedItemId, error);
    }
  }
}
