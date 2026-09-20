import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { syncArchiveMailbox } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  return NextResponse.json(await syncArchiveMailbox());
});
