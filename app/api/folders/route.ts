import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: folders, error }, { data: counts }] = await Promise.all([
    supabaseAdmin.from('folders').select('*').order('order').order('name'),
    supabaseAdmin.from('meeting_summaries').select('folder_id'),
  ]);
  if (error) throw new Error(error.message);
  const countMap = new Map<string, number>();
  for (const row of counts ?? []) countMap.set(row.folder_id, (countMap.get(row.folder_id) ?? 0) + 1);
  return NextResponse.json((folders ?? []).map((f) => ({ ...f, summary_count: countMap.get(f.id) ?? 0 })));
});
