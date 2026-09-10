import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { exportSummaryToDrive } from '@/lib/summaries/drive-export';

export const dynamic = 'force-dynamic';

export const POST = handleRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const result = await exportSummaryToDrive(id);
  if ('skipped' in result) {
    const message =
      result.skipped === 'no_connected_writer'
        ? 'No admin has connected Google Drive yet. Ask an admin to sign in with Google.'
        : 'Summary not found';
    throw new HttpError(result.skipped === 'not_found' ? 404 : 409, message);
  }
  await logAudit(user.id, 'summary.exported_to_drive', 'meeting_summary', id, { docId: result.docId });
  return NextResponse.json(result);
});
