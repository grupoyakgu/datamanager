import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const { data, error } = await getSupabaseAdmin().from('folder_rules').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return NextResponse.json(data ?? []);
});

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ tagId?: string; folderId?: string }>(request);
  if (!body.tagId || !body.folderId) throw new HttpError(400, 'tagId and folderId are required');
  const { data, error } = await getSupabaseAdmin()
    .from('folder_rules')
    .upsert({ tag_id: body.tagId, folder_id: body.folderId }, { onConflict: 'tag_id' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  await logAudit(user.id, 'folder_rule.saved', 'folder_rule', data.id, { tag_id: body.tagId, folder_id: body.folderId });
  return NextResponse.json(data, { status: 201 });
});
