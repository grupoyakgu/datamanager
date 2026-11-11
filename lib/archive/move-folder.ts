import { getSupabaseAdmin } from '@/lib/supabase';
import { setDocParents } from '@/lib/google/drive';
import { getArchiveMailboxUser } from './sync';
import { resolveArchiveDestination } from './folder-rules';
import { resolveOrCreateProject } from './projects';
import { ensureDomainReaderAccess } from '@/lib/google/drive';

/**
 * (Re)assign an archived item to a project — moving its attachments into
 * archive / <project> / <sender-domain subfolder, if configured>, same
 * destination logic as normal ingestion (see resolveArchiveDestination).
 * Used both to resolve the "needs a project" flag (no "tags:" line found)
 * and as a general-purpose re-file action.
 */
export async function moveArchiveItemToFolder(archivedItemId: string, projectName: string): Promise<{ id: string; name: string }> {
  const trimmed = projectName.trim();
  if (!trimmed) throw new Error('projectName is required');

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) throw new Error('The archive mailbox is not connected yet.');

  const supabaseAdmin = getSupabaseAdmin();
  const { data: item } = await supabaseAdmin
    .from('archived_items')
    .select('original_sender_email')
    .eq('id', archivedItemId)
    .maybeSingle();
  if (!item) throw new Error('Archived item not found');

  const destination = await resolveArchiveDestination(mailboxUser.id, trimmed, item.original_sender_email as string | null);

  const { data: attachments } = await supabaseAdmin
    .from('archive_attachments')
    .select('drive_file_id')
    .eq('archived_item_id', archivedItemId);
  for (const attachment of attachments ?? []) {
    if (!attachment.drive_file_id) continue;
    try {
      await setDocParents(mailboxUser.id, attachment.drive_file_id, [destination.folderId]);
    } catch (moveError) {
      console.error('Failed to move archive attachment', attachment.drive_file_id, 'to', destination.folderName, moveError);
    }
  }

  await supabaseAdmin
    .from('archived_items')
    .update({ project_id: destination.projectId, drive_folder_name: destination.folderName })
    .eq('id', archivedItemId);

  return { id: destination.folderId, name: destination.folderName };
}

/**
 * Move a single Drive file to a project folder (existing or newly created,
 * directly under the archive root — no sender-domain subfolder, since a raw
 * file has no associated sender). If the file is a known attachment of an
 * archived item, delegates to moveArchiveItemToFolder so the item's project
 * and folder name stay consistent with its other attachments. Otherwise
 * it's a plain Drive move with no DB record to update — e.g. a file an
 * admin uploaded directly, outside the Archive pipeline. Used by the Files
 * page to relocate anything shown there.
 */
export async function moveDriveFileToFolder(fileId: string, projectName: string): Promise<{ id: string; name: string }> {
  const trimmed = projectName.trim();
  if (!trimmed) throw new Error('projectName is required');

  const supabaseAdmin = getSupabaseAdmin();
  const { data: attachment } = await supabaseAdmin
    .from('archive_attachments')
    .select('archived_item_id')
    .eq('drive_file_id', fileId)
    .maybeSingle();
  if (attachment) {
    return moveArchiveItemToFolder(attachment.archived_item_id as string, trimmed);
  }

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) throw new Error('The archive mailbox is not connected yet.');

  const project = await resolveOrCreateProject(mailboxUser.id, trimmed);

  try {
    const domain = mailboxUser.email.split('@')[1];
    if (domain) await ensureDomainReaderAccess(mailboxUser.id, project.drive_folder_id, domain);
  } catch (shareError) {
    console.error('Failed to grant domain access on archive folder', project.drive_folder_id, shareError);
  }

  await setDocParents(mailboxUser.id, fileId, [project.drive_folder_id]);

  return { id: project.drive_folder_id, name: project.drive_folder_name };
}
