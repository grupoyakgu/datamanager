import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { ensureFolder, ensureDomainReaderAccess } from '@/lib/google/drive';
import { resolveOrCreateProject } from './projects';
import { resolveSenderDomain, recordSenderDomainFolder } from './sender-domains';

/**
 * The literal "archive" folder in the Archive mailbox's own Drive, under its
 * configured anchor (`settings.archive_drive_folder_id`, default that
 * account's own My Drive root) — every project folder, and the Files
 * page's browsing root, live under this one folder rather than loose in My
 * Drive. ensureFolder finds it by name once it exists, so repeated calls
 * all resolve to the same folder.
 */
export async function getArchiveDriveRootId(mailboxUserId: string): Promise<string> {
  const settings = await getSettings();
  const anchorId = settings.archive_drive_folder_id || 'root';
  return ensureFolder(mailboxUserId, anchorId, 'archive');
}

export interface ArchiveDestination {
  folderId: string;
  /** Display path, e.g. "bds32" or "bds32 / cm4arquitectos". */
  folderName: string;
  projectId: string;
}

/**
 * Where an archived item's attachments should be saved: archive root /
 * <project> / <sender-domain subfolder, if that domain is admin-configured>.
 * The project is found-or-created from the sender's declared "tags:"
 * project name (see parseInlineTags); the subfolder comes from
 * archive_sender_domains (admin-managed) — an unconfigured domain files
 * directly under the project folder instead, per spec.
 *
 * Whichever folder ends up being used is also given org-domain-wide read
 * access, so any signed-in user can open the file from their own Google
 * account regardless of who is logged into the app.
 */
export async function resolveArchiveDestination(
  mailboxUserId: string,
  projectName: string,
  originalSenderEmail: string | null
): Promise<ArchiveDestination> {
  const project = await resolveOrCreateProject(mailboxUserId, projectName);
  const senderDomain = originalSenderEmail?.toLowerCase().split('@')[1] || null;
  const domainConfig = await resolveSenderDomain(senderDomain);

  let folderId = project.drive_folder_id;
  let folderName = project.drive_folder_name;
  if (domainConfig) {
    folderId = await ensureFolder(mailboxUserId, project.drive_folder_id, domainConfig.folderName);
    folderName = `${project.drive_folder_name} / ${domainConfig.folderName}`;
    // Recorded so a later rename of this domain's display name can retarget
    // this exact folder by id instead of re-finding it by name (see
    // renameSenderDomainSubfolders).
    await recordSenderDomainFolder(domainConfig.id, project.id, folderId);
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: mailboxUser } = await supabaseAdmin.from('users').select('email').eq('id', mailboxUserId).maybeSingle();
    const domain = mailboxUser?.email ? (mailboxUser.email as string).split('@')[1] : null;
    if (domain) await ensureDomainReaderAccess(mailboxUserId, folderId, domain);
  } catch (shareError) {
    console.error('Failed to grant domain access on archive folder', folderId, shareError);
  }

  return { folderId, folderName, projectId: project.id };
}
