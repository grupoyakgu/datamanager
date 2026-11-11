import { getSupabaseAdmin } from '@/lib/supabase';
import { findFolderIdByName, renameFile } from '@/lib/google/drive';
import { listArchiveProjects } from './projects';
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

/**
 * Rename every already-existing Drive subfolder named `oldName` to `newName`
 * — one per project it was created under (a sender-domain subfolder isn't a
 * single folder: "bds32/cm4arquitectos" and "bds36/cm4arquitectos" are two
 * separate Drive folders that each happened to be created with that name).
 * Without this, renaming the admin-configured display name only affected
 * which name future uploads would look for, silently leaving every
 * already-filed subfolder under its old name — and worse, causing the next
 * upload to create a brand-new "newName" folder alongside it instead of
 * reusing the existing one, splitting that sender's files across two
 * folders per project.
 */
export async function renameSenderDomainSubfolders(mailboxUserId: string, oldName: string, newName: string): Promise<void> {
  if (oldName === newName) return;
  const projects = await listArchiveProjects();
  await Promise.all(
    projects.map(async (project) => {
      try {
        const folderId = await findFolderIdByName(mailboxUserId, project.drive_folder_id, oldName);
        if (folderId) await renameFile(mailboxUserId, folderId, newName);
      } catch (error) {
        console.error('Failed to rename sender-domain subfolder under project', project.name, error);
      }
    })
  );
}
