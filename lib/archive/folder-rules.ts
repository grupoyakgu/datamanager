import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { ensureFolder, ensureDomainReaderAccess } from '@/lib/google/drive';
import type { ArchiveFolderRule } from '@/types/database';

export async function listArchiveFolderRules(): Promise<ArchiveFolderRule[]> {
  const { data, error } = await getSupabaseAdmin().from('archive_folder_rules').select('*').order('pattern');
  if (error) {
    // 42P01 = relation does not exist — e.g. this code deployed before its
    // migration landed. Treat it as "no rules configured" rather than
    // failing every archive sync until the migration is applied.
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ArchiveFolderRule[];
}

/**
 * The literal "archive" folder in the Archive mailbox's own Drive, under its
 * configured anchor (`settings.archive_drive_folder_id`, default that
 * account's own My Drive root) — every per-sender folder, and the Files
 * page's browsing root, live under this one folder rather than loose in My
 * Drive. ensureFolder finds it by name once it exists, so repeated calls
 * all resolve to the same folder.
 */
export async function getArchiveDriveRootId(mailboxUserId: string): Promise<string> {
  const settings = await getSettings();
  const anchorId = settings.archive_drive_folder_id || 'root';
  return ensureFolder(mailboxUserId, anchorId, 'archive');
}

/**
 * The Drive folder an archived item's attachments should be saved into, all
 * under the Archive mailbox's OWN Drive (repo@grupoyakgu.es) — not any
 * admin's personal Drive — so the mailbox is a single shared, general-use
 * Drive for the whole org.
 *
 * An exact email rule wins over a domain rule. When nothing matches, a new
 * folder is created (named after the sender's domain, or their full email
 * when there is none) directly under the "archive" root (see
 * getArchiveDriveRootId), and persisted as a new domain rule so later
 * emails from the same sender reuse it instead of a new folder being
 * created every time.
 *
 * Whichever folder is used — admin-picked, admin-created, or just
 * auto-created here — is also given org-domain-wide read access, so any
 * signed-in user can open the file from their own Google account,
 * regardless of who is logged into the app.
 */
export async function resolveArchiveFolderId(mailboxUserId: string, originalSenderEmail: string | null): Promise<string> {
  const archiveRoot = await getArchiveDriveRootId(mailboxUserId);
  const supabaseAdmin = getSupabaseAdmin();

  const email = originalSenderEmail?.toLowerCase() ?? null;
  const senderDomain = email?.split('@')[1] || null;

  let folderId = archiveRoot;

  if (email) {
    const rules = await listArchiveFolderRules();
    const matched =
      rules.find((r) => r.pattern_type === 'email' && r.pattern === email) ??
      (senderDomain ? rules.find((r) => r.pattern_type === 'domain' && r.pattern === senderDomain) : undefined);

    if (matched) {
      folderId = matched.drive_folder_id;
    } else {
      const pattern = senderDomain ?? email;
      const patternType: 'email' | 'domain' = senderDomain ? 'domain' : 'email';
      folderId = await ensureFolder(mailboxUserId, archiveRoot, pattern);
      const { error } = await supabaseAdmin
        .from('archive_folder_rules')
        .insert({ pattern, pattern_type: patternType, drive_folder_id: folderId, drive_folder_name: pattern });
      if (error && error.code !== '23505' && error.code !== '42P01') {
        console.error('Failed to persist auto-created archive folder rule', pattern, error);
      }
    }
  }

  try {
    const { data: mailboxUser } = await supabaseAdmin.from('users').select('email').eq('id', mailboxUserId).maybeSingle();
    const domain = mailboxUser?.email ? (mailboxUser.email as string).split('@')[1] : null;
    if (domain) await ensureDomainReaderAccess(mailboxUserId, folderId, domain);
  } catch (shareError) {
    console.error('Failed to grant domain access on archive folder', folderId, shareError);
  }

  return folderId;
}
