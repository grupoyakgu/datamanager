import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listClassificationCategories } from '@/lib/archive/classification-categories';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  return NextResponse.json(await listClassificationCategories());
});

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ name?: string }>(request);
  const name = body.name?.trim();
  if (!name) throw new HttpError(400, 'name is required');

  const { data, error } = await getSupabaseAdmin().from('archive_classification_categories').insert({ name }).select('*').single();
  if (error) throw new HttpError(error.code === '23505' ? 409 : 500, error.message);

  await logAudit(user.id, 'archive_classification_category.created', 'archive_classification_category', data.id, { name });
  return NextResponse.json(data, { status: 201 });
});
