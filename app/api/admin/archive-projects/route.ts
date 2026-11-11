import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { listArchiveProjects } from '@/lib/archive/projects';

export const dynamic = 'force-dynamic';

/** Projects auto-create from senders' "tags:project_name" line — this just lists them for admin renaming, there's no manual create here. */
export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  return NextResponse.json(await listArchiveProjects());
});
