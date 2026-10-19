import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { ensureFolder } from '@/lib/google/drive';
import { getDriveWriter } from '@/lib/summaries/drive-export';

export const dynamic = 'force-dynamic';

/** Create (or find, if one with that name already exists) a folder directly under the configured Drive root. */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ name?: string }>(request);
  const name = body.name?.trim();
  if (!name) throw new HttpError(400, 'name is required');

  const writer = await getDriveWriter();
  if (!writer) throw new HttpError(409, 'No admin has connected Google Drive yet.');

  const settings = await getSettings();
  const rootId = settings.drive_root_folder_id || 'root';
  const id = await ensureFolder(writer.id, rootId, name);

  await logAudit(user.id, 'drive_folder.created', 'drive_folder', id, { name });
  return NextResponse.json({ id, name });
});
