import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { syncArchiveMailbox } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hourly check of the Archive mailbox, 08:00–22:00 (see vercel.json), split
 * out from the once-daily summaries/AI-retry cron so the archive mailbox is
 * checked far more often without multiplying those other jobs' Gemini calls.
 * Protected by CRON_SECRET.
 */
export const GET = handleRoute(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? new URL(request.url).searchParams.get('secret');
  if (!secret || provided !== secret) throw new HttpError(401, 'Unauthorized');
  const archive = await syncArchiveMailbox();
  return NextResponse.json({ archive, ran_at: new Date().toISOString() });
});
