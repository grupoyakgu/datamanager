import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ name?: string; description?: string }>(request);
  if (!body.name?.trim()) throw new HttpError(400, 'name is required');
  const supabaseAdmin = getSupabaseAdmin();
  const { data: last } = await supabaseAdmin.from('folders').select('order').order('order', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabaseAdmin
    .from('folders')
    .insert({ name: body.name.trim(), description: body.description?.trim() || null, order: (last?.order ?? -1) + 1 })
    .select('*')
    .single();
  if (error) throw new HttpError(error.code === '23505' ? 409 : 500, error.message);
  await logAudit(user.id, 'folder.created', 'folder', data.id, { name: data.name });
  return NextResponse.json(data, { status: 201 });
});

/** Reorder: body { ids: [...] } in the desired order. */
export const PUT = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ ids?: string[] }>(request);
  if (!Array.isArray(body.ids)) throw new HttpError(400, 'ids is required');
  const supabaseAdmin = getSupabaseAdmin();
  await Promise.all(body.ids.map((id, index) => supabaseAdmin.from('folders').update({ order: index }).eq('id', id)));
  await logAudit(user.id, 'folder.reordered', 'folder', '*', { ids: body.ids });
  return NextResponse.json({ ok: true });
});
