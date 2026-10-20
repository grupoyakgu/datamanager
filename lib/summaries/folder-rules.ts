import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { ensureFolder, ensureDomainReaderAccess } from '@/lib/google/drive';
import type { SummaryFolderRule } from '@/types/database';

export async function listSummaryFolderRules(): Promise<SummaryFolderRule[]> {
  const { data, error } = await getSupabaseAdmin().from('summary_folder_rules').select('*').order('pattern');
  if (error) {
    // 42P01 = relation does not exist — e.g. this code deployed before its
    // migration landed. Treat it as "no rules configured" rather than
    // failing every summary export until the migration is applied.
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SummaryFolderRule[];
}

/**
 * The literal "summaries" folder in the Archive mailbox's own Drive, under
 * its configured anchor (`settings.archive_drive_folder_id`) — sibling to
 * the "archive" folder (see lib/archive/folder-rules.ts).
 */
export async function getSummariesDriveRootId(mailboxUserId: string): Promise<string> {
  const settings = await getSettings();
  const anchorId = settings.archive_drive_folder_id || 'root';
  return ensureFolder(mailboxUserId, anchorId, 'summaries');
}

/**
 * The Drive folder a summary should be filed under, all in the Archive
 * mailbox's OWN Drive. An exact email rule wins over a domain rule. When
 * nothing matches, a new folder is created (named after the sender's
 * domain, or their full email when there is none) directly under the
 * "summaries" root, and persisted as a new domain rule — so later
 * summaries from the same sender reuse it, and an admin can give it a
 * friendlier display name (see admin/summary-folder-rules) without losing
 * that association.
 */
export async function resolveSummaryFolderId(
  mailboxUserId: string,
  senderEmail: string | null
): Promise<{ id: string; name: string }> {
  const summariesRoot = await getSummariesDriveRootId(mailboxUserId);
  const supabaseAdmin = getSupabaseAdmin();

  const email = senderEmail?.toLowerCase() ?? null;
  const senderDomain = email?.split('@')[1] || null;

  let folderId = summariesRoot;
  let folderName = 'summaries';

  if (email) {
    const rules = await listSummaryFolderRules();
    const matched =
      rules.find((r) => r.pattern_type === 'email' && r.pattern === email) ??
      (senderDomain ? rules.find((r) => r.pattern_type === 'domain' && r.pattern === senderDomain) : undefined);

    if (matched) {
      folderId = matched.drive_folder_id;
      folderName = matched.drive_folder_name;
    } else {
      const pattern = senderDomain ?? email;
      const patternType: 'email' | 'domain' = senderDomain ? 'domain' : 'email';
      folderId = await ensureFolder(mailboxUserId, summariesRoot, pattern);
      folderName = pattern;
      const { error } = await supabaseAdmin
        .from('summary_folder_rules')
        .insert({ pattern, pattern_type: patternType, drive_folder_id: folderId, drive_folder_name: pattern });
      if (error && error.code !== '23505' && error.code !== '42P01') {
        console.error('Failed to persist auto-created summary folder rule', pattern, error);
      }
    }
  }

  try {
    const { data: mailboxUser } = await supabaseAdmin.from('users').select('email').eq('id', mailboxUserId).maybeSingle();
    const domain = mailboxUser?.email ? (mailboxUser.email as string).split('@')[1] : null;
    if (domain) await ensureDomainReaderAccess(mailboxUserId, folderId, domain);
  } catch (shareError) {
    console.error('Failed to grant domain access on summaries folder', folderId, shareError);
  }

  return { id: folderId, name: folderName };
}
