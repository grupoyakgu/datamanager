import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listArchiveAttachmentsByTags } from '@/lib/archive/repository';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const tagIds = new URL(request.url).searchParams.getAll('tagId').filter(Boolean);
  return NextResponse.json(await listArchiveAttachmentsByTags(tagIds));
});
