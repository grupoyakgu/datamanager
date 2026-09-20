import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getAncestors, getFile, listFolder, searchFiles } from '@/lib/google/drive';
import { GoogleAuthError } from '@/lib/google/oauth';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const params = new URL(request.url).searchParams;
  const settings = await getSettings();
  const rootId = settings.drive_root_folder_id || 'root';
  const requestedFolderId = params.get('folderId') || rootId;
  const query = params.get('q')?.trim();

  try {
    const rootFile = rootId === 'root' ? null : await getFile(user.id, rootId).catch(() => null);

    if (query) {
      const matches = await searchFiles(user.id, query);
      // Drive's search has no "under this folder" filter, so it's scoped
      // here by walking each match's own ancestry and keeping only the ones
      // that actually live under the configured root.
      const files =
        rootId === 'root'
          ? matches
          : (
              await Promise.all(
                matches.map(async (file) => {
                  if (file.id === rootId) return file;
                  const chain = await getAncestors(user.id, file.id);
                  return chain.some((a) => a.id === rootId) ? file : null;
                })
              )
            ).filter((f): f is NonNullable<typeof f> => !!f);
      return NextResponse.json({ folder: null, ancestors: [], files, rootId, rootName: rootFile?.name ?? null });
    }

    const fullAncestors = await getAncestors(user.id, requestedFolderId);

    // Never allow browsing outside the configured root: only the root
    // itself, or one of its real Drive descendants, may ever be served —
    // regardless of what folderId a client sends. fullAncestors is
    // root-first and always ends with the requested folder itself.
    let folderId = requestedFolderId;
    let ancestors = fullAncestors;
    if (rootId !== 'root') {
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
    }

    const [folder, listing] = await Promise.all([
      folderId === 'root' ? Promise.resolve(null) : getFile(user.id, folderId).catch(() => null),
      listFolder(user.id, folderId, params.get('pageToken') ?? undefined),
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
          message: 'The configured Drive folder could not be found. Ask an admin to check Admin → Drive.',
        },
        { status: 409 }
      );
    }
    throw error;
  }
});
