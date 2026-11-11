import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { deleteFile, ensureFolder, ensureDomainReaderAccess, uploadFile } from '@/lib/google/drive';
import { getAttachmentData } from '@/lib/google/gmail';
import { resolveArchiveDestination, getArchiveDriveRootId } from './folder-rules';
import { TEMP_FOLDER_NAME } from '@/lib/email-domains';

/**
 * Where to upload this item's attachments: a real project/sender-domain
 * destination when a project was identified, or a shared "Temp" folder
 * directly under the archive root when it wasn't (no "tags:" line found —
 * flagged for manual review, see ingestArchiveMessage).
 */
async function resolveUploadDestination(
  ingestedBy: string,
  projectName: string | null,
  originalSenderEmail: string | null
): Promise<{ folderId: string; folderName: string; projectId: string | null }> {
  if (!projectName) {
    const root = await getArchiveDriveRootId(ingestedBy);
    const folderId = await ensureFolder(ingestedBy, root, TEMP_FOLDER_NAME);
    try {
      const { data: mailboxUser } = await getSupabaseAdmin().from('users').select('email').eq('id', ingestedBy).maybeSingle();
      const domain = mailboxUser?.email ? (mailboxUser.email as string).split('@')[1] : null;
      if (domain) await ensureDomainReaderAccess(ingestedBy, folderId, domain);
    } catch (shareError) {
      console.error('Failed to grant domain access on Temp folder', shareError);
    }
    return { folderId, folderName: TEMP_FOLDER_NAME, projectId: null };
  }
  const destination = await resolveArchiveDestination(ingestedBy, projectName, originalSenderEmail);
  return { folderId: destination.folderId, folderName: destination.folderName, projectId: destination.projectId };
}

/**
 * Upload every not-yet-synced attachment of an archived item into its
 * resolved project/sender-domain destination (or "Temp" when no project was
 * identified), using the Archive mailbox's OWN Google connection
 * (`ingestedBy`) for both reading the attachment bytes from Gmail and
 * writing them to Drive, so every file actually lives in repo@grupoyakgu.es's
 * own Drive. Saved under its own original filename, exactly as it arrived on
 * the email — nothing prefixed or appended. Best-effort per attachment: one
 * failure doesn't block the others.
 *
 * Dedup: before uploading, each attachment's content is hashed (SHA-256) and
 * checked against every other attachment ever uploaded. An exact match
 * reuses that existing Drive file instead of uploading a second copy — the
 * new row (and whatever tags/metadata this email carries) still points at
 * it, so the same file stays findable through multiple emails/tags without
 * existing twice in Drive.
 */
export async function exportArchiveAttachments(archivedItemId: string, ingestedBy: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  const [{ data: item }, { data: attachmentRows }] = await Promise.all([
    supabaseAdmin.from('archived_items').select('original_sender_email, project_id, email_received_at').eq('id', archivedItemId).maybeSingle(),
    supabaseAdmin
      .from('archive_attachments')
      .select('id, gmail_message_id, gmail_attachment_id, filename, mime_type, drive_file_id')
      .eq('archived_item_id', archivedItemId)
      .is('drive_file_id', null),
  ]);
  const attachments = attachmentRows ?? [];
  if (attachments.length === 0 || !item) return;

  let projectName: string | null = null;
  if (item.project_id) {
    const { data: project } = await supabaseAdmin.from('archive_projects').select('name').eq('id', item.project_id).maybeSingle();
    projectName = (project?.name as string | undefined) ?? null;
  }

  const destination = await resolveUploadDestination(ingestedBy, projectName, item.original_sender_email as string | null);
  await supabaseAdmin
    .from('archived_items')
    .update({ drive_folder_name: destination.folderName, project_id: destination.projectId })
    .eq('id', archivedItemId);

  for (const attachment of attachments) {
    try {
      const data = await getAttachmentData(ingestedBy, attachment.gmail_message_id, attachment.gmail_attachment_id);
      const contentHash = crypto.createHash('sha256').update(data).digest('hex');

      const { data: duplicate } = await supabaseAdmin
        .from('archive_attachments')
        .select('drive_file_id')
        .eq('content_hash', contentHash)
        .not('drive_file_id', 'is', null)
        .limit(1)
        .maybeSingle();

      const driveFileId = duplicate?.drive_file_id
        ? (duplicate.drive_file_id as string)
        : (
            await uploadFile(ingestedBy, {
              name: attachment.filename,
              mimeType: attachment.mime_type,
              parents: [destination.folderId],
              data,
              // The file's own "modified" date should reflect when the
              // source email was actually sent, not whenever this upload
              // happens to run — never the Drive-upload time as a stand-in.
              modifiedTime: (item.email_received_at as string | null) ?? undefined,
            })
          ).id;

      await supabaseAdmin
        .from('archive_attachments')
        .update({ drive_file_id: driveFileId, content_hash: contentHash, drive_synced_at: new Date().toISOString(), drive_sync_error: null })
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
