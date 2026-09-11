import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSummaryById } from '@/lib/summaries/repository';
import { recomputeCompleteness } from '@/lib/summaries/process';
import { deleteSummaryFromDrive, exportSummaryToDrive } from '@/lib/summaries/drive-export';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface SummaryPatchBody {
  folderId?: string;
  tagIds?: string[];
  title?: string;
  meetingDate?: string | null;
  meetingTime?: string | null;
  participants?: string[];
  companies?: string[];
  topics?: string[];
  actionItems?: string[];
  decisions?: string[];
}

function cleanList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return Array.from(
    new Set(
      value
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0)
    )
  );
}

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
  const body = await readJson<SummaryPatchBody>(request);
  const supabaseAdmin = getSupabaseAdmin();

  const patch: Record<string, unknown> = {};
  if (body.folderId) patch.folder_id = body.folderId;
  if (body.title?.trim()) patch.title = body.title.trim();
  if (body.meetingDate !== undefined) patch.meeting_date = body.meetingDate || null;
  if (body.meetingTime !== undefined) patch.meeting_time = body.meetingTime || null;
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

  const extractedPatch: Record<string, unknown> = {};
  const participants = cleanList(body.participants);
  const companies = cleanList(body.companies);
  const topics = cleanList(body.topics);
  const actionItems = cleanList(body.actionItems);
  const decisions = cleanList(body.decisions);
  if (participants !== undefined) extractedPatch.participants = participants;
  if (companies !== undefined) extractedPatch.companies = companies;
  if (topics !== undefined) extractedPatch.topics = topics;
  if (actionItems !== undefined) extractedPatch.action_items = actionItems;
  if (decisions !== undefined) extractedPatch.decisions = decisions;

  if (Object.keys(extractedPatch).length > 0) {
    const { error } = await supabaseAdmin
      .from('extracted_data')
      .upsert({ summary_id: id, ...extractedPatch }, { onConflict: 'summary_id' });
    if (error) throw new Error(error.message);
  }

  const shouldRecompute =
    Array.isArray(body.tagIds) ||
    body.meetingDate !== undefined ||
    body.meetingTime !== undefined ||
    Object.keys(extractedPatch).length > 0;
  if (shouldRecompute) await recomputeCompleteness(id);

  if (Array.isArray(body.tagIds)) {
    // Tags decide which Drive folder(s) the exported Doc lives in; move it now.
    try {
      await exportSummaryToDrive(id);
    } catch (driveError) {
      console.error('Drive export failed after tag update for', id, driveError);
    }
  }

  await logAudit(user.id, 'summary.updated', 'meeting_summary', id, body as Record<string, unknown>);

  const summary = await getSummaryById(id, user.id);
  if (!summary) throw new HttpError(404, 'Summary not found');
  return NextResponse.json(summary);
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  if (user.role !== 'admin') throw new HttpError(403, 'Only admins can delete summaries');

  // Best-effort: remove the exported Doc and any attachment files from Drive
  // before deleting the record, so a re-sync doesn't leave orphaned files.
  try {
    await deleteSummaryFromDrive(id);
  } catch (driveError) {
    console.error('Failed to remove Drive files for summary', id, driveError);
  }

  const { error } = await getSupabaseAdmin().from('meeting_summaries').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAudit(user.id, 'summary.deleted', 'meeting_summary', id);
  return NextResponse.json({ ok: true });
});
