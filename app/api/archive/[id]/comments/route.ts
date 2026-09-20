import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getArchiveItemById } from '@/lib/archive/repository';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const POST = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const body = await readJson<{ body?: string }>(request);
  const text = body.body?.trim();
  if (!text) throw new HttpError(400, 'Comment text is required');

  const existing = await getArchiveItemById(id);
  if (!existing) throw new HttpError(404, 'Archived item not found');

  const { error } = await getSupabaseAdmin()
    .from('archive_comments')
    .insert({ archived_item_id: id, user_id: user.id, body: text });
  if (error) throw new Error(error.message);

  await logAudit(user.id, 'archive.commented', 'archived_item', id);

  const item = await getArchiveItemById(id);
  if (!item) throw new HttpError(404, 'Archived item not found');
  return NextResponse.json(item);
});
