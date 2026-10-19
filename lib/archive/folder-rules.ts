import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
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
 * The Drive folder an archived item's attachments should be saved into,
 * chosen by the admin-managed sender/domain rules (an exact email match
 * wins over a domain match), falling back to the single fixed Archive
 * Drive folder when nothing matches.
 */
export async function resolveArchiveFolderId(originalSenderEmail: string | null): Promise<string> {
  const settings = await getSettings();
  if (!originalSenderEmail) return settings.archive_drive_folder_id;

  const email = originalSenderEmail.toLowerCase();
  const domain = email.split('@')[1] ?? null;
  const rules = await listArchiveFolderRules();

  const emailMatch = rules.find((r) => r.pattern_type === 'email' && r.pattern === email);
  if (emailMatch) return emailMatch.drive_folder_id;

  const domainMatch = domain ? rules.find((r) => r.pattern_type === 'domain' && r.pattern === domain) : undefined;
  return domainMatch?.drive_folder_id ?? settings.archive_drive_folder_id;
}
