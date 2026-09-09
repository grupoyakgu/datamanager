import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit') ?? 100), 500);
  const { data, error } = await getSupabaseAdmin()
    .from('audit_logs')
    .select('*, user:users ( name, email )')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return NextResponse.json(data ?? []);
});
