import { getSupabaseAdmin } from '@/lib/supabase';
import { ensureFolder, ensureDomainReaderAccess, setDocParents } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { getSummariesDriveRootId } from './folder-rules';

/**
 * Move a summary's exported .docx to a different Drive folder (existing or
 * newly created, found-or-created by name under the "summaries" root), and
 * remember that exact sender's email for next time — an "email"-type rule
 * always wins over the domain default (see resolveSummaryFolderId), so
 * later summaries from this same address land here automatically instead
 * of back in "Temp". Used both for the gmail.com/"Temp" triage flow and as
 * a general-purpose re-file action.
 */
export async function moveSummaryToFolder(summaryId: string, folderName: string): Promise<{ id: string; name: string }> {
  const trimmed = folderName.trim();
  if (!trimmed) throw new Error('folderName is required');

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) throw new Error('The archive mailbox is not connected yet.');

  const supabaseAdmin = getSupabaseAdmin();
  const { data: summary } = await supabaseAdmin
    .from('meeting_summaries')
    .select('original_sender_email, drive_doc_id')
    .eq('id', summaryId)
    .maybeSingle();
  if (!summary) throw new Error('Summary not found');

  const root = await getSummariesDriveRootId(mailboxUser.id);
  const folderId = await ensureFolder(mailboxUser.id, root, trimmed);

  try {
    const domain = mailboxUser.email.split('@')[1];
    if (domain) await ensureDomainReaderAccess(mailboxUser.id, folderId, domain);
  } catch (shareError) {
    console.error('Failed to grant domain access on summaries folder', folderId, shareError);
  }

  if (summary.drive_doc_id) {
    try {
      await setDocParents(mailboxUser.id, summary.drive_doc_id, [folderId]);
    } catch (moveError) {
      console.error('Failed to move summary Drive file', summary.drive_doc_id, 'to', trimmed, moveError);
    }
  }

  await supabaseAdmin.from('meeting_summaries').update({ drive_folder_name: trimmed }).eq('id', summaryId);

  const senderEmail = summary.original_sender_email as string | null;
  if (senderEmail) {
    const { error } = await supabaseAdmin
      .from('summary_folder_rules')
      .upsert(
        { pattern: senderEmail.toLowerCase(), pattern_type: 'email', drive_folder_id: folderId, drive_folder_name: trimmed },
        { onConflict: 'pattern' }
      );
    if (error) console.error('Failed to persist email folder rule after move', senderEmail, error);
  }

  return { id: folderId, name: trimmed };
}
