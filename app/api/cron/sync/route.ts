import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { syncAllConnectedUsers } from '@/lib/summaries/sync';
import { syncArchiveMailbox } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Scheduled Gmail sync (see vercel.json). Protected by CRON_SECRET. */
export const GET = handleRoute(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? new URL(request.url).searchParams.get('secret');
  if (!secret || provided !== secret) throw new HttpError(401, 'Unauthorized');
  const [results, archive] = await Promise.all([syncAllConnectedUsers(), syncArchiveMailbox()]);
  return NextResponse.json({ results, archive, ran_at: new Date().toISOString() });
});
