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
 * Create a rule for any sender-domain folder a summary is already filed
 * under (drive_folder_name) that predates this table — e.g. summaries
 * exported before this feature existed. Without this, those folders exist
 * in Drive and are referenced by summaries, but have nothing in the admin
 * UI to rename. Treats each distinct `drive_folder_name` as the pattern
 * (exactly what resolveSummaryFolderId would have used), looks up (or
 * creates, if it was somehow deleted) the matching Drive folder, and
 * persists a rule for it. Idempotent and safe to call on every list.
 */
export async function backfillSummaryFolderRules(mailboxUserId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: summaries }, { data: existingRules }] = await Promise.all([
    supabaseAdmin.from('meeting_summaries').select('drive_folder_name').not('drive_folder_name', 'is', null),
    supabaseAdmin.from('summary_folder_rules').select('drive_folder_name'),
  ]);
  // Compare against existing rules' DISPLAY names, not their pattern (the
  // domain) — once a rule is renamed those diverge, and comparing against
  // pattern would make every summary filed under the new display name look
  // "unregistered" again, creating a duplicate rule for it on every call.
  const existingNames = new Set((existingRules ?? []).map((r) => r.drive_folder_name as string));
  const missing = Array.from(new Set((summaries ?? []).map((s) => s.drive_folder_name as string))).filter(
    (name) => !existingNames.has(name)
  );
  if (missing.length === 0) return;

  const summariesRoot = await getSummariesDriveRootId(mailboxUserId);
  for (const name of missing) {
    try {
      const folderId = await ensureFolder(mailboxUserId, summariesRoot, name);
      const patternType: 'email' | 'domain' = name.includes('@') ? 'email' : 'domain';
      const { error } = await supabaseAdmin
        .from('summary_folder_rules')
        .insert({ pattern: name, pattern_type: patternType, drive_folder_id: folderId, drive_folder_name: name });
      if (error && error.code !== '23505') console.error('Failed to backfill summary folder rule', name, error);
    } catch (error) {
      console.error('Failed to backfill summary folder rule', name, error);
    }
  }
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
