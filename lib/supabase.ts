import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not set. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/** Browser/anon client. Safe to import from client components. */
/**
 * Implicit flow on purpose: the session comes back in the URL hash and needs no
 * per-origin PKCE verifier, so sign-in still completes when Supabase returns the
 * user to its Site URL instead of the exact origin the flow started on.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

/**
 * True for a "that table doesn't exist" error — e.g. code queries a table
 * from a migration that hasn't been applied to this project yet. Checks
 * both codes because the two Supabase query paths report it differently:
 * PostgREST (the supabase-js client used everywhere in this app) reports
 * 'PGRST205' ("Could not find the table ... in the schema cache"), while
 * raw Postgres reports '42P01' (undefined_table) — only relevant code ever
 * queries the latter directly, but checking it too costs nothing.
 */
export function isMissingTableError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client for server code (API routes, server actions).
 * Created lazily so that builds and client bundles never require the service key.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set on the server');
  }

  adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}
