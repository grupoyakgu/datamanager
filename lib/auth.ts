import { getSupabaseAdmin } from './supabase';
import { HttpError } from './http';
import type { User } from '@/types/database';

export interface AuthContext {
  user: User;
  accessToken: string;
}

/** Validate the Bearer token and load the caller's profile row. */
export async function requireUser(request: Request): Promise<AuthContext> {
  const authHeader = request.headers.get('authorization') ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) throw new HttpError(401, 'Unauthorized');

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) throw new HttpError(401, 'Unauthorized');

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  let user = profile as User | null;
  if (!user) {
    // Fallback for accounts created before the auth trigger existed.
    const { data: created, error: insertError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          id: data.user.id,
          email: (data.user.email ?? '').toLowerCase(),
          name: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? null,
          avatar_url: data.user.user_metadata?.avatar_url ?? data.user.user_metadata?.picture ?? null,
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single();
    if (insertError) throw new HttpError(500, 'Could not create user profile');
    user = created as User;
  }

  if (user.status === 'suspended') throw new HttpError(403, 'Account suspended');
  return { user, accessToken };
}

export async function requireAdmin(request: Request): Promise<AuthContext> {
  const ctx = await requireUser(request);
  if (ctx.user.role !== 'admin') throw new HttpError(403, 'Admin access required');
  return ctx;
}

export async function logAudit(
  userId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  changes?: Record<string, unknown>
) {
  const { error } = await getSupabaseAdmin().from('audit_logs').insert({
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    changes: changes ?? null,
  });
  if (error) console.error('Audit log failed:', error.message);
}
