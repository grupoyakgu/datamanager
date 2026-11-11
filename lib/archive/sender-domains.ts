import { getSupabaseAdmin, isMissingTableError } from '@/lib/supabase';
import { findFolderIdByName, renameFile } from '@/lib/google/drive';
import { listArchiveProjects } from './projects';
import type { ArchiveSenderDomain } from '@/types/database';

export async function listSenderDomains(): Promise<ArchiveSenderDomain[]> {
  const { data, error } = await getSupabaseAdmin().from('archive_sender_domains').select('*').order('domain');
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ArchiveSenderDomain[];
}

/** The sender domain row (id + configured subfolder display name) for a sender's email domain, or null if that domain isn't configured — in which case attachments file directly under the project folder. The id is needed to record which Drive folder ends up being used for it (see recordSenderDomainFolder). */
export async function resolveSenderDomain(domain: string | null): Promise<{ id: string; folderName: string } | null> {
  if (!domain) return null;
  const { data, error } = await getSupabaseAdmin().from('archive_sender_domains').select('id, folder_name').ilike('domain', domain).maybeSingle();
  if (error && !isMissingTableError(error)) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id as string, folderName: data.folder_name as string };
}

/**
 * The Drive folder id already recorded for a (sender domain, project) pair,
 * if any — lets a caller reuse that exact folder directly instead of
 * re-deriving it from the domain's current display name, which is what
 * actually creates a brand-new, wrongly-named folder the moment that name
 * no longer matches what's in Drive (e.g. right after a rename). Once a
 * folder is tracked, name lookups should never be needed for it again.
 */
export async function getTrackedSenderDomainFolderId(senderDomainId: string, projectId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('archive_sender_domain_folders')
    .select('drive_folder_id')
    .eq('sender_domain_id', senderDomainId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error && !isMissingTableError(error)) throw new Error(error.message);
  return (data?.drive_folder_id as string | undefined) ?? null;
}

/**
 * Record which Drive folder id was actually used/created for a (sender
 * domain, project) pair. A sender-domain subfolder isn't a single Drive
 * folder — "bds32/cm4arquitectos" and "bds36/cm4arquitectos" are two
 * separate folders that happen to share a name — so this is the only
 * reliable way to find the *same* folder again later (e.g. to rename it)
 * without depending on its name still matching whatever's in the database.
 * Safe to call every time a destination is resolved, not just the first.
 */
export async function recordSenderDomainFolder(senderDomainId: string, projectId: string, driveFolderId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('archive_sender_domain_folders')
    .upsert({ sender_domain_id: senderDomainId, project_id: projectId, drive_folder_id: driveFolderId }, { onConflict: 'sender_domain_id,project_id' });
  // Table not found = deployed before its migration landed; the name-matching fallback still works without it.
  if (error && !isMissingTableError(error)) console.error('Failed to record sender-domain folder mapping', error);
}

/**
 * Original seed folder names from migration 020, before any admin ever
 * renamed them. Used only as a last-resort fallback when renaming a
 * domain's subfolders: if a project's subfolder was created before
 * recordSenderDomainFolder existed, AND its folder_name was already renamed
 * once (so the database's "old" value no longer matches what's actually in
 * Drive), this is the only remaining way to find it. Harmless for any
 * domain added after that migration — the lookup just misses.
 */
const LEGACY_SEED_FOLDER_NAMES: Record<string, string> = {
  'cm4arquitectos.com': 'cm4arquitectos',
  'rzs.es': 'RZS',
  'sinver.es': 'Sinver',
  'grupoyakgu.es': 'grupoyakgu',
};

/**
 * Rename every Drive subfolder created for this sender domain, across all
 * projects, from oldName to newName — otherwise a rename here would only
 * affect which name future uploads look for, silently leaving every
 * already-filed subfolder under its old name while the next upload creates
 * a brand-new one under the new name.
 *
 * Tries, in order: the folder id recorded by recordSenderDomainFolder
 * (reliable regardless of what the folder is actually named), a direct
 * name match on oldName (for a folder created before that tracking
 * existed), and finally the original seed name (for a folder whose name
 * already drifted once, before tracking existed, so oldName itself is
 * stale). Whichever one succeeds gets recorded, so every later rename for
 * that project is id-based from then on.
 */
export async function renameSenderDomainSubfolders(
  mailboxUserId: string,
  senderDomainId: string,
  domain: string,
  oldName: string,
  newName: string
): Promise<void> {
  // No early return for oldName === newName: re-saving the same display
  // name is also how an admin can manually trigger a repair pass (e.g. if a
  // rename happened before a project existed, or before this tracking was
  // added) — the legacy-seed-name fallback below only ever runs here, and a
  // same-name rename in Drive is a harmless no-op.
  const supabaseAdmin = getSupabaseAdmin();
  const legacySeedName = LEGACY_SEED_FOLDER_NAMES[domain.toLowerCase()];
  const [projects, trackedResult] = await Promise.all([
    listArchiveProjects(),
    supabaseAdmin.from('archive_sender_domain_folders').select('project_id, drive_folder_id').eq('sender_domain_id', senderDomainId),
  ]);
  // Table not found = deployed before its migration landed; fall back to name-matching for every project.
  if (trackedResult.error && !isMissingTableError(trackedResult.error)) throw new Error(trackedResult.error.message);
  const trackedByProject = new Map((trackedResult.data ?? []).map((r) => [r.project_id as string, r.drive_folder_id as string]));

  await Promise.all(
    projects.map(async (project) => {
      try {
        const folderId =
          trackedByProject.get(project.id) ??
          (await findFolderIdByName(mailboxUserId, project.drive_folder_id, oldName)) ??
          (legacySeedName && legacySeedName !== oldName ? await findFolderIdByName(mailboxUserId, project.drive_folder_id, legacySeedName) : null);
        if (!folderId) return;
        await renameFile(mailboxUserId, folderId, newName);
        await recordSenderDomainFolder(senderDomainId, project.id, folderId);
      } catch (error) {
        console.error('Failed to rename sender-domain subfolder under project', project.name, error);
      }
    })
  );
}
