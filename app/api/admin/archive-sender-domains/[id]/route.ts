import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Rename a configured domain's subfolder display name (the domain itself can't be changed — delete and re-add instead). */
export const PATCH = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const body = await readJson<{ folderName?: string }>(request);
  const folderName = body.folderName?.trim();
  if (!folderName) throw new HttpError(400, 'folderName is required');

  const { data, error } = await getSupabaseAdmin()
    .from('archive_sender_domains')
    .update({ folder_name: folderName })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new HttpError(500, error.message);

  await logAudit(user.id, 'archive_sender_domain.renamed', 'archive_sender_domain', id, { folderName });
  return NextResponse.json(data);
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('archive_sender_domains').delete().eq('id', id);
  if (error) throw new HttpError(500, error.message);
  await logAudit(user.id, 'archive_sender_domain.deleted', 'archive_sender_domain', id);
  return NextResponse.json({ ok: true });
});
