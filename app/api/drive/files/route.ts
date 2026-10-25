import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getAncestors, getFile, listFolder, searchFiles, type DriveFile } from '@/lib/google/drive';
import { GoogleAuthError } from '@/lib/google/oauth';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { getArchiveDriveRootId } from '@/lib/archive/folder-rules';
import { prettySenderName } from '@/lib/archive/display-name';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export type DriveFileWithSource = DriveFile & { source: string | null; uploadedBy: string | null; archivedItemId: string | null };

/**
 * For each (non-folder) file, look up which archived item it came from —
 * "source" is who the email was originally sent from; "uploadedBy" is the
 * team member who sent (or forwarded) it to the Archive mailbox, not the
 * mailbox account itself (every file is technically written by that one
 * shared account, which isn't useful to show). Folders aren't tied to a
 * single sender, so they're left blank.
 *
 * Also overrides the displayed name with the attachment's own original
 * filename (archive_attachments.filename) in place of the actual Drive
 * file name, which is deliberately prefixed with the archived item's title
 * and a disambiguating suffix (see attachmentDriveName in
 * lib/archive/drive-export.ts) — useful when browsing Drive directly, but
 * not what should show as "Name" in this app. Falls back to the raw Drive
 * name for anything with no matching record (e.g. files an admin uploaded
 * directly, outside the Archive pipeline).
 */
async function withSourceInfo(files: DriveFile[]): Promise<DriveFileWithSource[]> {
  const fileIds = files.filter((f) => !f.isFolder).map((f) => f.id);
  if (fileIds.length === 0) return files.map((f) => ({ ...f, source: null, uploadedBy: null, archivedItemId: null }));

  const supabaseAdmin = getSupabaseAdmin();
  const { data: attachmentRows } = await supabaseAdmin
    .from('archive_attachments')
    .select('drive_file_id, archived_item_id, filename')
    .in('drive_file_id', fileIds);

  const itemIds = Array.from(new Set((attachmentRows ?? []).map((r) => r.archived_item_id as string)));
  const { data: itemRows } =
    itemIds.length > 0
      ? await supabaseAdmin
          .from('archived_items')
          .select('id, original_sender_name, original_sender_email, forwarded_by_name, forwarded_by_email, is_forward')
          .in('id', itemIds)
      : { data: [] };
  const itemById = new Map((itemRows ?? []).map((i) => [i.id as string, i]));

  const metaByFileId = new Map<
    string,
    { name: string | null; source: string | null; uploadedBy: string | null; archivedItemId: string | null }
  >();
  for (const row of attachmentRows ?? []) {
    const item = itemById.get(row.archived_item_id as string);
    if (!item) continue;
    // "Uploaded by" = whoever sent it TO the archive mailbox: the forwarder
    // on a forward, or the direct sender otherwise (original_sender_* holds
    // the direct sender's info in that case — see ingestArchiveMessage).
    const uploadedBy = item.is_forward
      ? prettySenderName(item.forwarded_by_name as string | null, item.forwarded_by_email as string | null)
      : prettySenderName(item.original_sender_name as string | null, item.original_sender_email as string | null);
    metaByFileId.set(row.drive_file_id as string, {
      name: (row.filename as string | null) || null,
      source: prettySenderName(item.original_sender_name as string | null, item.original_sender_email as string | null),
      uploadedBy,
      archivedItemId: row.archived_item_id as string,
    });
  }

  return files.map((f) => {
    const meta = metaByFileId.get(f.id);
    return {
      ...f,
      name: meta?.name ?? f.name,
      source: meta?.source ?? null,
      uploadedBy: meta?.uploadedBy ?? null,
      archivedItemId: meta?.archivedItemId ?? null,
    };
  });
}

/**
 * The Files page browses the Archive mailbox's own Drive (repo@grupoyakgu.es,
 * rooted at its "archive" folder) using the mailbox's own connection — not
 * the signed-in viewer's — so every user sees the same shared drive
 * regardless of whose Google account they happen to be signed in with.
 */
export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const params = new URL(request.url).searchParams;

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) {
    return NextResponse.json(
      { error: 'drive_not_connected', message: 'The shared archive Drive is not connected yet.' },
      { status: 409 }
    );
  }
  const actingUserId = mailboxUser.id;

  try {
    const rootId = await getArchiveDriveRootId(actingUserId);
    const requestedFolderId = params.get('folderId') || rootId;
    const query = params.get('q')?.trim();
    const rootFile = await getFile(actingUserId, rootId).catch(() => null);

    if (query) {
      const matches = await searchFiles(actingUserId, query);
      // Drive's search has no "under this folder" filter, so it's scoped
      // here by walking each match's own ancestry and keeping only the ones
      // that actually live under the archive root.
      const matched = (
        await Promise.all(
          matches.map(async (file) => {
            if (file.id === rootId) return file;
            const chain = await getAncestors(actingUserId, file.id);
            return chain.some((a) => a.id === rootId) ? file : null;
          })
        )
      ).filter((f): f is NonNullable<typeof f> => !!f);
      const files = await withSourceInfo(matched);
      return NextResponse.json({ folder: null, ancestors: [], files, rootId, rootName: rootFile?.name ?? null });
    }

    const fullAncestors = await getAncestors(actingUserId, requestedFolderId);

    // Never allow browsing outside the archive root: only the root itself,
    // or one of its real Drive descendants, may ever be served — regardless
    // of what folderId a client sends. fullAncestors is root-first and
    // always ends with the requested folder itself.
    let folderId = requestedFolderId;
    let ancestors = fullAncestors;
    const isRoot = requestedFolderId === rootId;
    const rootIndex = fullAncestors.findIndex((a) => a.id === rootId);
    if (isRoot) {
      ancestors = [];
    } else if (rootIndex !== -1) {
      ancestors = fullAncestors.slice(rootIndex + 1);
    } else {
      // Not the root and not a descendant of it — clamp back to root.
      folderId = rootId;
      ancestors = [];
    }

    const [folder, listing] = await Promise.all([
      getFile(actingUserId, folderId).catch(() => null),
      listFolder(actingUserId, folderId, params.get('pageToken') ?? undefined),
    ]);
    const files = await withSourceInfo(listing.files);
    return NextResponse.json({
      folder,
      ancestors,
      files,
      nextPageToken: listing.nextPageToken,
      rootId,
      rootName: rootFile?.name ?? null,
    });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'drive_not_connected', message: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message.startsWith('Google API 404')) {
      return NextResponse.json(
        {
          error: 'drive_root_invalid',
          message: 'The Archive Drive root folder could not be found. Ask an admin to check Admin → Archive.',
        },
        { status: 409 }
      );
    }
    throw error;
  }
});
