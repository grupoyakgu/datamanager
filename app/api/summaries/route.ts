import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { searchSummaries } from '@/lib/search';
import { getDefaultFolderId, getSummaryById } from '@/lib/summaries/repository';
import { processSummary } from '@/lib/summaries/process';

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

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const body = await readJson<{ title?: string; content?: string; folderId?: string; meetingDate?: string | null }>(request);
  if (!body.title?.trim() || !body.content?.trim()) throw new HttpError(400, 'title and content are required');

  const folderId = body.folderId || (await getDefaultFolderId());
  const { data, error } = await getSupabaseAdmin()
    .from('meeting_summaries')
    .insert({
      title: body.title.trim(),
      content: body.content.trim(),
      folder_id: folderId,
      meeting_date: body.meetingDate || null,
      created_by: user.id,
      source: 'manual',
      original_email_id: `manual-${user.id}-${Date.now()}`,
      completeness_score: 0,
      processing_status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  await logAudit(user.id, 'summary.created', 'meeting_summary', data.id);
  try {
    await processSummary(data.id);
  } catch (processError) {
    console.error('Processing failed for manual summary', data.id, processError);
  }
  return NextResponse.json(await getSummaryById(data.id, user.id), { status: 201 });
});
