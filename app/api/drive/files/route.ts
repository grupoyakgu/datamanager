import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getAncestors, getFile, listFolder, searchFiles } from '@/lib/google/drive';
import { GoogleAuthError } from '@/lib/google/oauth';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { getArchiveDriveRootId } from '@/lib/archive/folder-rules';

export const dynamic = 'force-dynamic';

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
      const files = (
        await Promise.all(
          matches.map(async (file) => {
            if (file.id === rootId) return file;
            const chain = await getAncestors(actingUserId, file.id);
            return chain.some((a) => a.id === rootId) ? file : null;
          })
        )
      ).filter((f): f is NonNullable<typeof f> => !!f);
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
    return NextResponse.json({
      folder,
      ancestors,
      files: listing.files,
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
