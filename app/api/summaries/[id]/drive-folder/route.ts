import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSummaryById } from '@/lib/summaries/repository';
import { moveSummaryToDriveFolder } from '@/lib/summaries/drive-export';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface DriveFolderBody {
  folderName: string | null;
}

export const POST = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const body = await readJson<DriveFolderBody>(request);

  const existing = await getSummaryById(id, user.id);
  if (!existing) throw new HttpError(404, 'Summary not found');

  await moveSummaryToDriveFolder(id, body.folderName ?? null);
  await logAudit(user.id, 'summary.drive_folder_moved', 'meeting_summary', id, { folderName: body.folderName ?? null });

  const summary = await getSummaryById(id, user.id);
  if (!summary) throw new HttpError(404, 'Summary not found');
  return NextResponse.json(summary);
});
