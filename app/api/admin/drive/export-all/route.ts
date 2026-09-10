import { NextResponse } from 'next/server';
import { handleRoute, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { exportAllSummariesToDrive } from '@/lib/summaries/drive-export';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ force?: boolean }>(request).catch(() => ({}) as { force?: boolean });
  const result = await exportAllSummariesToDrive(!!body.force);
  await logAudit(user.id, 'drive.export_all', 'meeting_summary', '*', { ...result });
  return NextResponse.json(result);
});
