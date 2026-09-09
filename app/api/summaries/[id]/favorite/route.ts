import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const POST = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const { error } = await getSupabaseAdmin()
    .from('favorites')
    .upsert({ user_id: user.id, summary_id: id }, { onConflict: 'user_id,summary_id' });
  if (error) throw new Error(error.message);
  return NextResponse.json({ is_favorite: true });
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('favorites').delete().eq('user_id', user.id).eq('summary_id', id);
  if (error) throw new Error(error.message);
  return NextResponse.json({ is_favorite: false });
});
