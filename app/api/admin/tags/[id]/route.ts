import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function parseAliases(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : (value ?? '').split(',');
  return Array.from(new Set(list.map((a) => a.trim()).filter(Boolean)));
}

export const PATCH = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const body = await readJson<{ name?: string; description?: string | null; is_active?: boolean; aliases?: string | string[] }>(request);
  const patch: Record<string, unknown> = {};
  if (body.name?.trim()) patch.name = body.name.trim();
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.aliases !== undefined) patch.aliases = parseAliases(body.aliases);
  const { data, error } = await getSupabaseAdmin().from('tags').update(patch).eq('id', id).select('*').single();
  if (error) throw new HttpError(error.code === '23505' ? 409 : 500, error.message);
  await logAudit(user.id, 'tag.updated', 'tag', id, patch);
  return NextResponse.json(data);
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('tags').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAudit(user.id, 'tag.deleted', 'tag', id);
  return NextResponse.json({ ok: true });
});
