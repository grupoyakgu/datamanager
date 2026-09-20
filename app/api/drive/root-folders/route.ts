import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listFolder } from '@/lib/google/drive';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Folders that actually exist in Drive directly under the configured root — used to drive the "Folder" filter. */
export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const settings = await getSettings();
  const rootId = settings.drive_root_folder_id || 'root';

  try {
    const listing = await listFolder(user.id, rootId);
    const folders = listing.files
      .filter((f) => f.isFolder)
      .map((f) => ({ id: f.id, name: f.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(folders);
  } catch (error) {
    // Non-critical for a filter dropdown: degrade to an empty list rather
    // than break the page if Drive isn't reachable right now.
    console.error('Failed to list Drive root folders', error);
    return NextResponse.json([]);
  }
});
