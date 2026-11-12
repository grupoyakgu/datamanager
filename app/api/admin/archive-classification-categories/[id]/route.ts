import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('archive_classification_categories').delete().eq('id', id);
  if (error) throw new HttpError(500, error.message);
  await logAudit(user.id, 'archive_classification_category.deleted', 'archive_classification_category', id);
  return NextResponse.json({ ok: true });
});
