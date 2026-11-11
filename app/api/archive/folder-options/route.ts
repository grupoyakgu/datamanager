import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listArchiveProjects } from '@/lib/archive/projects';

export const dynamic = 'force-dynamic';

/** Every project any signed-in user can (re)assign an archived item to — not admin-gated. */
export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const projects = await listArchiveProjects();
  const options = projects
    .map((p) => ({ id: p.id, name: p.drive_folder_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json(options);
});
