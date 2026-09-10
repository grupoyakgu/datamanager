import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSettings, updateSettings, type AppSettings } from '@/lib/settings';
import { resolveDriveRootId } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  return NextResponse.json(await getSettings());
});

export const PATCH = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<Partial<AppSettings>>(request);

  if (typeof body.drive_root_folder_id === 'string') {
    try {
      body.drive_root_folder_id = await resolveDriveRootId(user.id, body.drive_root_folder_id);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid Drive folder');
    }
  }

  await updateSettings(body);
  await logAudit(user.id, 'settings.updated', 'app_settings', '*', { keys: Object.keys(body) });
  return NextResponse.json(await getSettings());
});
