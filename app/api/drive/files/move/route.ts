import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { moveDriveFileToFolder } from '@/lib/archive/move-folder';

export const dynamic = 'force-dynamic';

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const body = await readJson<{ fileId?: string; folderName?: string }>(request);
  if (!body.fileId?.trim()) throw new HttpError(400, 'fileId is required');
  if (!body.folderName?.trim()) throw new HttpError(400, 'folderName is required');

  const folder = await moveDriveFileToFolder(body.fileId, body.folderName);
  await logAudit(user.id, 'drive.moved_file', 'drive_file', body.fileId, { folderName: body.folderName.trim() });

  return NextResponse.json(folder);
});
