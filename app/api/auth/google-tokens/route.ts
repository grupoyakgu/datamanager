import { NextResponse } from 'next/server';
import { handleRoute, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { storeGoogleTokens } from '@/lib/google/oauth';

export const dynamic = 'force-dynamic';

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const body = await readJson<{ provider_token?: string | null; provider_refresh_token?: string | null }>(request);
  await storeGoogleTokens(user.id, {
    accessToken: body.provider_token ?? null,
    refreshToken: body.provider_refresh_token ?? null,
  });
  await logAudit(user.id, 'google.connected', 'user', user.id, { has_refresh_token: !!body.provider_refresh_token });
  return NextResponse.json({ ok: true, connected: !!body.provider_refresh_token });
});
