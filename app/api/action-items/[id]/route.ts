import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { updateActionItemStatus, type ActionItemStatus } from '@/lib/summaries/action-items';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ActionItemStatus[] = ['open', 'in_process', 'closed'];

export const PATCH = handleRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const body = await readJson<{ status?: string }>(request);
  if (!body.status || !VALID_STATUSES.includes(body.status as ActionItemStatus)) {
    throw new HttpError(400, 'status must be one of open, in_process, closed');
  }

  await updateActionItemStatus(id, body.status as ActionItemStatus);
  await logAudit(user.id, 'action_item.status_updated', 'action_item', id, { status: body.status });
  return NextResponse.json({ ok: true });
});
