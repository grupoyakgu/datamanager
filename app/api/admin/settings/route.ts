import { NextResponse } from 'next/server';
import { handleRoute, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSettings, updateSettings, type AppSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  return NextResponse.json(await getSettings());
});

export const PATCH = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<Partial<AppSettings>>(request);
  await updateSettings(body);
  await logAudit(user.id, 'settings.updated', 'app_settings', '*', { keys: Object.keys(body) });
  return NextResponse.json(await getSettings());
});
