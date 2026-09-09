import { getSupabaseAdmin } from '@/lib/supabase';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly',
];

export class GoogleAuthError extends Error {
  constructor(message: string, public reauthRequired = false) {
    super(message);
  }
}

interface ConnectionRow {
  user_id: string;
  refresh_token: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  status: string;
}

/** Persist tokens returned by Supabase after the Google OAuth redirect. */
export async function storeGoogleTokens(
  userId: string,
  tokens: { accessToken?: string | null; refreshToken?: string | null; expiresIn?: number | null; scopes?: string[] }
) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing } = await supabaseAdmin
    .from('google_connections')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  const refreshToken = tokens.refreshToken || existing?.refresh_token || null;
  const expiresAt = tokens.accessToken
    ? new Date(Date.now() + (tokens.expiresIn ?? 3600) * 1000).toISOString()
    : null;

  const { error } = await supabaseAdmin.from('google_connections').upsert(
    {
      user_id: userId,
      refresh_token: refreshToken,
      access_token: tokens.accessToken ?? null,
      token_expires_at: expiresAt,
      scopes: tokens.scopes ?? GOOGLE_SCOPES,
      status: refreshToken ? 'connected' : 'authorization_required',
      last_error: null,
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from('users')
    .update({ gmail_connected: !!refreshToken, gmail_status: refreshToken ? 'connected' : 'authorization_required' })
    .eq('id', userId);
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const body = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !body.access_token) {
    const reauth = body.error === 'invalid_grant';
    throw new GoogleAuthError(`Google token refresh failed: ${body.error ?? response.status}`, reauth);
  }
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

export async function markAuthorizationRequired(userId: string, reason: string) {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from('google_connections')
    .update({ status: 'authorization_required', last_error: reason })
    .eq('user_id', userId);
  await supabaseAdmin
    .from('users')
    .update({ gmail_connected: false, gmail_status: 'authorization_required' })
    .eq('id', userId);
}

/** Return a valid Google access token for the user, refreshing when needed. */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from('google_connections')
    .select('user_id, refresh_token, access_token, token_expires_at, status')
    .eq('user_id', userId)
    .maybeSingle();
  const connection = data as ConnectionRow | null;

  if (!connection?.refresh_token) {
    throw new GoogleAuthError('Google account not connected', true);
  }

  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (connection.access_token && expiresAt - Date.now() > 60_000) {
    return connection.access_token;
  }

  try {
    const refreshed = await refreshAccessToken(connection.refresh_token);
    await supabaseAdmin
      .from('google_connections')
      .update({
        access_token: refreshed.accessToken,
        token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        status: 'connected',
        last_error: null,
      })
      .eq('user_id', userId);
    return refreshed.accessToken;
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reauthRequired) {
      await markAuthorizationRequired(userId, error.message);
    }
    throw error;
  }
}

export async function googleFetch<T>(userId: string, url: string, init: RequestInit = {}): Promise<T> {
  const token = await getGoogleAccessToken(userId);
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    const text = await response.text();
    if (response.status === 401) await markAuthorizationRequired(userId, text.slice(0, 300));
    throw new GoogleAuthError(`Google API ${response.status}: ${text.slice(0, 300)}`, response.status === 401);
  }
  if (!response.ok) {
    throw new Error(`Google API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}
