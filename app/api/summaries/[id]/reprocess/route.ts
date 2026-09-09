import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { processSummary } from '@/lib/summaries/process';
import { getSummaryById } from '@/lib/summaries/repository';

export const dynamic = 'force-dynamic';

export const POST = handleRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  await processSummary(id);
  await logAudit(user.id, 'summary.reprocessed', 'meeting_summary', id);
  const summary = await getSummaryById(id, user.id);
  if (!summary) throw new HttpError(404, 'Summary not found');
  return NextResponse.json(summary);
});
