import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getDefaultFolderId } from '@/lib/summaries/repository';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const PATCH = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const body = await readJson<{ name?: string; description?: string | null; is_default?: boolean }>(request);
  const supabaseAdmin = getSupabaseAdmin();

  if (body.is_default === true) {
    await supabaseAdmin.from('folders').update({ is_default: false }).eq('is_default', true);
  }
  const patch: Record<string, unknown> = {};
  if (body.name?.trim()) patch.name = body.name.trim();
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.is_default !== undefined) patch.is_default = body.is_default;

  const { data, error } = await supabaseAdmin.from('folders').update(patch).eq('id', id).select('*').single();
  if (error) throw new HttpError(error.code === '23505' ? 409 : 500, error.message);
  await logAudit(user.id, 'folder.updated', 'folder', id, patch);
  return NextResponse.json(data);
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  const { data: folder } = await supabaseAdmin.from('folders').select('id, is_default').eq('id', id).maybeSingle();
  if (!folder) throw new HttpError(404, 'Folder not found');
  if (folder.is_default) throw new HttpError(400, 'The default folder cannot be deleted');

  // Move summaries to the default folder so nothing is lost.
  const defaultId = await getDefaultFolderId();
  if (defaultId === id) throw new HttpError(400, 'Cannot delete the only folder');
  await supabaseAdmin.from('meeting_summaries').update({ folder_id: defaultId }).eq('folder_id', id);
  const { error } = await supabaseAdmin.from('folders').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAudit(user.id, 'folder.deleted', 'folder', id, { moved_to: defaultId });
  return NextResponse.json({ ok: true });
});
