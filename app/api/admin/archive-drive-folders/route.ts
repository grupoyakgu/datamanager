import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { ensureFolder, listFolder } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';

/** Folders that exist directly under the Archive Drive root, read using the Archive mailbox's own connection. */
export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) return NextResponse.json([]);

  const settings = await getSettings();
  const rootId = settings.archive_drive_folder_id || 'root';
  try {
    const listing = await listFolder(mailboxUser.id, rootId);
    const folders = listing.files
      .filter((f) => f.isFolder)
      .map((f) => ({ id: f.id, name: f.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(folders);
  } catch (error) {
    console.error('Failed to list Archive Drive folders', error);
    return NextResponse.json([]);
  }
});

/** Create (or find, if one with that name already exists) a folder directly under the Archive Drive root. */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ name?: string }>(request);
  const name = body.name?.trim();
  if (!name) throw new HttpError(400, 'name is required');

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) throw new HttpError(409, 'The archive mailbox is not connected yet.');

  const settings = await getSettings();
  const rootId = settings.archive_drive_folder_id || 'root';
  const id = await ensureFolder(mailboxUser.id, rootId, name);

  await logAudit(user.id, 'archive_drive_folder.created', 'drive_folder', id, { name });
  return NextResponse.json({ id, name });
});
