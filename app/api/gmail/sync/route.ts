import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { syncAllConnectedUsers, syncUser } from '@/lib/summaries/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const body = await readJson<{ scope?: 'me' | 'all'; userId?: string }>(request).catch(() => ({}) as { scope?: 'me' | 'all'; userId?: string });

  if (body.scope === 'all') {
    if (user.role !== 'admin') throw new HttpError(403, 'Admin access required');
    return NextResponse.json({ results: await syncAllConnectedUsers() });
  }
  if (body.userId && body.userId !== user.id) {
    if (user.role !== 'admin') throw new HttpError(403, 'Admin access required');
    return NextResponse.json({ results: [await syncUser(body.userId)] });
  }
  return NextResponse.json({ results: [await syncUser(user.id)] });
});
