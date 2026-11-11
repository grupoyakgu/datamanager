import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listArchiveItems } from '@/lib/archive/repository';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const params = new URL(request.url).searchParams;
  const q = params.get('q') ?? undefined;
  const projectId = params.get('projectId') ?? undefined;
  return NextResponse.json(await listArchiveItems(q, projectId));
});
