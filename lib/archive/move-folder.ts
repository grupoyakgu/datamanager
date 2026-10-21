import { getSupabaseAdmin } from '@/lib/supabase';
import { ensureFolder, ensureDomainReaderAccess, setDocParents } from '@/lib/google/drive';
import { getArchiveMailboxUser } from './sync';
import { getArchiveDriveRootId } from './folder-rules';

/**
 * Move an archived item's attachments to a different Drive folder (existing
 * or newly created, found-or-created by name under the "archive" root), and
 * remember that exact sender's email for next time — an "email"-type rule
 * always wins over the domain default (see resolveArchiveFolderId), so
 * later emails from this same address land here automatically instead of
 * back in "Temp". Used both for the gmail.com/"Temp" triage flow and as a
 * general-purpose re-file action.
 */
export async function moveArchiveItemToFolder(archivedItemId: string, folderName: string): Promise<{ id: string; name: string }> {
  const trimmed = folderName.trim();
  if (!trimmed) throw new Error('folderName is required');

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) throw new Error('The archive mailbox is not connected yet.');

  const supabaseAdmin = getSupabaseAdmin();
  const { data: item } = await supabaseAdmin
    .from('archived_items')
    .select('original_sender_email')
    .eq('id', archivedItemId)
    .maybeSingle();
  if (!item) throw new Error('Archived item not found');

  const root = await getArchiveDriveRootId(mailboxUser.id);
  const folderId = await ensureFolder(mailboxUser.id, root, trimmed);

  try {
    const domain = mailboxUser.email.split('@')[1];
    if (domain) await ensureDomainReaderAccess(mailboxUser.id, folderId, domain);
  } catch (shareError) {
    console.error('Failed to grant domain access on archive folder', folderId, shareError);
  }

  const { data: attachments } = await supabaseAdmin
    .from('archive_attachments')
    .select('drive_file_id')
    .eq('archived_item_id', archivedItemId);
  for (const attachment of attachments ?? []) {
    if (!attachment.drive_file_id) continue;
    try {
      await setDocParents(mailboxUser.id, attachment.drive_file_id, [folderId]);
    } catch (moveError) {
      console.error('Failed to move archive attachment', attachment.drive_file_id, 'to', trimmed, moveError);
    }
  }

  await supabaseAdmin.from('archived_items').update({ drive_folder_name: trimmed }).eq('id', archivedItemId);

  const senderEmail = item.original_sender_email as string | null;
  if (senderEmail) {
    const { error } = await supabaseAdmin
      .from('archive_folder_rules')
      .upsert(
        { pattern: senderEmail.toLowerCase(), pattern_type: 'email', drive_folder_id: folderId, drive_folder_name: trimmed },
        { onConflict: 'pattern' }
      );
    if (error) console.error('Failed to persist email folder rule after move', senderEmail, error);
  }

  return { id: folderId, name: trimmed };
}
