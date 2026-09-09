import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function parseAliases(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : (value ?? '').split(',');
  return Array.from(new Set(list.map((a) => a.trim()).filter(Boolean)));
}

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ name?: string; description?: string; aliases?: string | string[] }>(request);
  if (!body.name?.trim()) throw new HttpError(400, 'name is required');
  const { data, error } = await getSupabaseAdmin()
    .from('tags')
    .insert({ name: body.name.trim(), description: body.description?.trim() || null, aliases: parseAliases(body.aliases) })
    .select('*')
    .single();
  if (error) throw new HttpError(error.code === '23505' ? 409 : 500, error.message);
  await logAudit(user.id, 'tag.created', 'tag', data.id, { name: data.name });
  return NextResponse.json(data, { status: 201 });
});
