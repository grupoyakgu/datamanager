import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { searchSummaries } from '@/lib/search';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const params = new URL(request.url).searchParams;
  const tagIds = params.getAll('tagId').filter(Boolean);

  const response = await searchSummaries(
    {
      query: params.get('q') ?? undefined,
      dateFrom: params.get('dateFrom') ?? undefined,
      dateTo: params.get('dateTo') ?? undefined,
      folderId: params.get('folderId') ?? undefined,
      driveFolderName: params.get('driveFolder') ?? undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      participant: params.get('participant') ?? undefined,
      favoritesOf: params.get('favorites') === '1' ? user.id : undefined,
      incompleteOnly: params.get('incomplete') === '1',
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
      offset: params.get('offset') ? Number(params.get('offset')) : undefined,
    },
    user.id
  );
  return NextResponse.json(response);
});
