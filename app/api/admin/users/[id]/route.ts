import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const PATCH = handleRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user: admin } = await requireAdmin(request);
  const { id } = await params;
  const body = await readJson<{ status?: 'active' | 'suspended'; role?: 'admin' | 'user' }>(request);
  const patch: Record<string, string> = {};
  if (body.status && ['active', 'suspended'].includes(body.status)) patch.status = body.status;
  if (body.role && ['admin', 'user'].includes(body.role)) patch.role = body.role;
  if (id === admin.id && (patch.status === 'suspended' || patch.role === 'user')) {
    throw new HttpError(400, 'You cannot suspend or demote your own account');
  }
  const { data, error } = await getSupabaseAdmin().from('users').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  await logAudit(admin.id, 'user.updated', 'user', id, patch);
  return NextResponse.json(data);
});
