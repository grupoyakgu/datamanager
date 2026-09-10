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
  const folderId = params.get('folderId') || rootId;
  const query = params.get('q')?.trim();

  try {
    if (query) {
      return NextResponse.json({ folder: null, ancestors: [], files: await searchFiles(user.id, query), rootId });
    }
    const [folder, listing, ancestors] = await Promise.all([
      folderId === 'root' ? Promise.resolve(null) : getFile(user.id, folderId).catch(() => null),
      listFolder(user.id, folderId, params.get('pageToken') ?? undefined),
      getAncestors(user.id, folderId),
    ]);
    return NextResponse.json({ folder, ancestors, files: listing.files, nextPageToken: listing.nextPageToken, rootId });
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
