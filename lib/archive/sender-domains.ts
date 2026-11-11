import { getSupabaseAdmin } from '@/lib/supabase';
import type { ArchiveSenderDomain } from '@/types/database';

export async function listSenderDomains(): Promise<ArchiveSenderDomain[]> {
  const { data, error } = await getSupabaseAdmin().from('archive_sender_domains').select('*').order('domain');
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ArchiveSenderDomain[];
}

/** The configured subfolder display name for a sender's email domain, or null if that domain isn't configured — in which case attachments file directly under the project folder. */
export async function resolveSenderDomainFolderName(domain: string | null): Promise<string | null> {
  if (!domain) return null;
  const { data, error } = await getSupabaseAdmin().from('archive_sender_domains').select('folder_name').ilike('domain', domain).maybeSingle();
  if (error && error.code !== '42P01') throw new Error(error.message);
  return (data?.folder_name as string | undefined) ?? null;
}
