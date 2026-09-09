import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const DELETE = handleRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('folder_rules').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAudit(user.id, 'folder_rule.deleted', 'folder_rule', id);
  return NextResponse.json({ ok: true });
});
