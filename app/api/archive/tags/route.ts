import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listArchiveTags } from '@/lib/archive/repository';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  return NextResponse.json(await listArchiveTags());
});
