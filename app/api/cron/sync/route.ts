import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { syncAllConnectedUsers } from '@/lib/summaries/sync';
import { reprocessFailedAiSummaries } from '@/lib/summaries/process';
import { syncArchiveMailbox } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduled daily sync (see vercel.json). Protected by CRON_SECRET. Steps
 * run sequentially rather than in parallel so their Gemini calls don't pile
 * up against the API's per-minute rate limit at the same moment.
 */
export const GET = handleRoute(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? new URL(request.url).searchParams.get('secret');
  if (!secret || provided !== secret) throw new HttpError(401, 'Unauthorized');
  const results = await syncAllConnectedUsers();
  const archive = await syncArchiveMailbox();
  const aiRetry = await reprocessFailedAiSummaries();
  return NextResponse.json({ results, archive, aiRetry, ran_at: new Date().toISOString() });
});
