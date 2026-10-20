import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listActionItems, type ActionItemStatus } from '@/lib/summaries/action-items';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ActionItemStatus[] = ['open', 'in_process', 'closed'];

export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const params = new URL(request.url).searchParams;
  const requested = params.getAll('status').filter((s): s is ActionItemStatus => VALID_STATUSES.includes(s as ActionItemStatus));
  const items = await listActionItems(requested.length > 0 ? { statuses: requested } : undefined);
  return NextResponse.json(items);
});
