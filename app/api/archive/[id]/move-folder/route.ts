import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { moveArchiveItemToFolder } from '@/lib/archive/move-folder';
import { getArchiveItemById } from '@/lib/archive/repository';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const POST = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const body = await readJson<{ folderName?: string }>(request);
  if (!body.folderName?.trim()) throw new HttpError(400, 'folderName is required');

  await moveArchiveItemToFolder(id, body.folderName);
  await logAudit(user.id, 'archive.moved_folder', 'archived_item', id, { folderName: body.folderName.trim() });

  const item = await getArchiveItemById(id);
  if (!item) throw new HttpError(404, 'Archived item not found');
  return NextResponse.json(item);
});
