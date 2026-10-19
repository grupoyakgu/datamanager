import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { syncRepoMailbox } from '@/lib/mailbox-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hourly check of the shared repo@ mailbox, 08:00–22:00 (see vercel.json):
 * every new email becomes either an Archive item (has attachments) or a
 * Summary (doesn't), in one pass — see lib/mailbox-sync.ts. Protected by
 * CRON_SECRET.
 */
export const GET = handleRoute(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? new URL(request.url).searchParams.get('secret');
  if (!secret || provided !== secret) throw new HttpError(401, 'Unauthorized');
  const result = await syncRepoMailbox();
  return NextResponse.json({ ...result, ran_at: new Date().toISOString() });
});
