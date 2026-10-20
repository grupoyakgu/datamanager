import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { listSummaryFolderRules } from '@/lib/summaries/folder-rules';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  return NextResponse.json(await listSummaryFolderRules());
});
