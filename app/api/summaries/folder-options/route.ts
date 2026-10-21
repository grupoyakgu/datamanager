import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listSummaryFolderRules } from '@/lib/summaries/folder-rules';

export const dynamic = 'force-dynamic';

/** Distinct Drive folders any signed-in user can move a summary into — not admin-gated, unlike the rule-management routes. */
export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const rules = await listSummaryFolderRules();
  const byId = new Map(rules.map((r) => [r.drive_folder_id, r.drive_folder_name]));
  const options = Array.from(byId.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json(options);
});
