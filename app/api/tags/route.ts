import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const includeInactive = new URL(request.url).searchParams.get('all') === '1';
  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin.from('tags').select('*').order('name');
  if (!includeInactive) query = query.eq('is_active', true);
  const [{ data: tags, error }, { data: links }] = await Promise.all([
    query,
    supabaseAdmin.from('meeting_summary_tags').select('tag_id'),
  ]);
  if (error) throw new Error(error.message);
  const countMap = new Map<string, number>();
  for (const row of links ?? []) countMap.set(row.tag_id, (countMap.get(row.tag_id) ?? 0) + 1);
  return NextResponse.json((tags ?? []).map((t) => ({ ...t, summary_count: countMap.get(t.id) ?? 0 })));
});
