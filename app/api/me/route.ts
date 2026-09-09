import { NextResponse } from 'next/server';
import { handleRoute, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  return NextResponse.json(user);
});

export const PATCH = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const body = await readJson<{ language?: string; theme?: string }>(request);
  const patch: Record<string, string> = {};
  if (body.language && ['en', 'es'].includes(body.language)) patch.language = body.language;
  if (body.theme && ['light', 'dark', 'system'].includes(body.theme)) patch.theme = body.theme;

  const { data, error } = await getSupabaseAdmin().from('users').update(patch).eq('id', user.id).select('*').single();
  if (error) throw new Error(error.message);
  return NextResponse.json(data);
});
