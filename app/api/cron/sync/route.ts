import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { reprocessFailedAiSummaries } from '@/lib/summaries/process';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduled daily retry (see vercel.json) for summaries that fell back to
 * heuristics because Gemini failed transiently. Protected by CRON_SECRET.
 * Ingestion itself runs on the repo@ mailbox's own, more frequent cron — see
 * /api/cron/archive-sync.
 */
export const GET = handleRoute(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? new URL(request.url).searchParams.get('secret');
  if (!secret || provided !== secret) throw new HttpError(401, 'Unauthorized');
  const aiRetry = await reprocessFailedAiSummaries();
  return NextResponse.json({ aiRetry, ran_at: new Date().toISOString() });
});
