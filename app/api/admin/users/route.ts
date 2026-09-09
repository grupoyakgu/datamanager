import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: users, error }, { data: connections }] = await Promise.all([
    supabaseAdmin.from('users').select('*').order('created_at'),
    supabaseAdmin.from('google_connections').select('user_id, status, last_sync_at, last_error, scopes'),
  ]);
  if (error) throw new Error(error.message);
  const byUser = new Map((connections ?? []).map((c) => [c.user_id as string, c]));
  return NextResponse.json((users ?? []).map((u) => ({ ...u, connection: byUser.get(u.id) ?? null })));
});
