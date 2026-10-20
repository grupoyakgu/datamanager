import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { listSummaryFolderRules, backfillSummaryFolderRules } from '@/lib/summaries/folder-rules';
import { getArchiveMailboxUser } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);

  const mailboxUser = await getArchiveMailboxUser();
  if (mailboxUser) {
    try {
      await backfillSummaryFolderRules(mailboxUser.id);
    } catch (error) {
      console.error('Failed to backfill summary folder rules', error);
    }
  }

  return NextResponse.json(await listSummaryFolderRules());
});
