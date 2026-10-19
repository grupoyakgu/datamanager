import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { syncArchiveMailbox } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Any signed-in user can trigger a manual sync (e.g. right after emailing a
// file to the archive mailbox) — not just admins.
export const POST = handleRoute(async (request: Request) => {
  await requireUser(request);
  return NextResponse.json(await syncArchiveMailbox());
});
