import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSummaryById } from '@/lib/summaries/repository';
import { recomputeCompleteness } from '@/lib/summaries/process';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const summary = await getSummaryById(id, user.id);
  if (!summary) throw new HttpError(404, 'Summary not found');
  return NextResponse.json(summary);
});

export const PATCH = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const body = await readJson<{ folderId?: string; tagIds?: string[]; title?: string; meetingDate?: string | null }>(request);
  const supabaseAdmin = getSupabaseAdmin();

  const patch: Record<string, unknown> = {};
  if (body.folderId) patch.folder_id = body.folderId;
  if (body.title?.trim()) patch.title = body.title.trim();
  if (body.meetingDate !== undefined) patch.meeting_date = body.meetingDate || null;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from('meeting_summaries').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  if (Array.isArray(body.tagIds)) {
    await supabaseAdmin.from('meeting_summary_tags').delete().eq('summary_id', id);
    if (body.tagIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('meeting_summary_tags')
        .insert(body.tagIds.map((tagId) => ({ summary_id: id, tag_id: tagId })));
      if (error) throw new Error(error.message);
    }
  }

  if (Array.isArray(body.tagIds) || body.meetingDate !== undefined) await recomputeCompleteness(id);
  await logAudit(user.id, 'summary.updated', 'meeting_summary', id, body as Record<string, unknown>);

  const summary = await getSummaryById(id, user.id);
  if (!summary) throw new HttpError(404, 'Summary not found');
  return NextResponse.json(summary);
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  if (user.role !== 'admin') throw new HttpError(403, 'Only admins can delete summaries');
  const { error } = await getSupabaseAdmin().from('meeting_summaries').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAudit(user.id, 'summary.deleted', 'meeting_summary', id);
  return NextResponse.json({ ok: true });
});
