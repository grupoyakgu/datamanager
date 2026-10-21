import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { moveSummaryToFolder } from '@/lib/summaries/move-folder';
import { getSummaryById } from '@/lib/summaries/repository';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const POST = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const body = await readJson<{ folderName?: string }>(request);
  if (!body.folderName?.trim()) throw new HttpError(400, 'folderName is required');

  await moveSummaryToFolder(id, body.folderName);
  await logAudit(user.id, 'summary.moved_folder', 'meeting_summary', id, { folderName: body.folderName.trim() });

  const summary = await getSummaryById(id, user.id);
  if (!summary) throw new HttpError(404, 'Summary not found');
  return NextResponse.json(summary);
});
