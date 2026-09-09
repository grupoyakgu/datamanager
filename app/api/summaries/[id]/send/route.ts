import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSummaryById } from '@/lib/summaries/repository';
import { sendEmail } from '@/lib/google/gmail';
import { GoogleAuthError } from '@/lib/google/oauth';

export const dynamic = 'force-dynamic';

function parseAddresses(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
}

export const POST = handleRoute(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const body = await readJson<{ to?: string; cc?: string; subject?: string; message?: string }>(request);

  const to = parseAddresses(body.to);
  if (to.length === 0) throw new HttpError(400, 'At least one valid recipient is required');
  const summary = await getSummaryById(id, user.id);
  if (!summary) throw new HttpError(404, 'Summary not found');

  const meta = [
    summary.meeting_date ? `Date: ${summary.meeting_date}${summary.meeting_time ? ' ' + summary.meeting_time : ''}` : null,
    summary.participants.length > 0 ? `Participants: ${summary.participants.join(', ')}` : null,
    summary.tags.length > 0 ? `Tags: ${summary.tags.map((t) => t.name).join(', ')}` : null,
  ].filter(Boolean);

  const text = [body.message?.trim(), '', '----------------------------------------', summary.title, ...meta, '', summary.content]
    .filter((line) => line !== undefined)
    .join('\n');

  try {
    const result = await sendEmail(user.id, {
      to,
      cc: parseAddresses(body.cc),
      subject: body.subject?.trim() || summary.title,
      text,
    });
    await logAudit(user.id, 'summary.sent', 'meeting_summary', id, { to, cc: parseAddresses(body.cc) });
    return NextResponse.json({ ok: true, messageId: result.id });
  } catch (error) {
    if (error instanceof GoogleAuthError) throw new HttpError(409, 'Gmail authorization required. Sign in again.');
    throw error;
  }
});
