import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { resolveReviewToken, consumeReviewToken } from '@/lib/archive/review-tokens';
import { moveArchiveItemToFolder } from '@/lib/archive/move-folder';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

/**
 * Public, unauthenticated by design: the token itself (random, single-use,
 * expiring) is the only credential, so the original sender of a
 * no-"tags:"-line email can assign its project without needing an account
 * in this system. Never returns anything beyond the item's own title and
 * subject.
 */
export const GET = handleRoute(async (_request: Request, { params }: Params) => {
  const { token } = await params;
  const result = await resolveReviewToken(token);
  if (!result) throw new HttpError(404, 'This link is invalid, already used, or has expired.');
  return NextResponse.json({ title: result.title, subject: result.subject });
});

export const POST = handleRoute(async (request: Request, { params }: Params) => {
  const { token } = await params;
  const result = await resolveReviewToken(token);
  if (!result) throw new HttpError(404, 'This link is invalid, already used, or has expired.');

  const body = await readJson<{ projectName?: string }>(request);
  const projectName = body.projectName?.trim();
  if (!projectName) throw new HttpError(400, 'projectName is required');

  await moveArchiveItemToFolder(result.archivedItemId, projectName);
  await consumeReviewToken(token);
  return NextResponse.json({ ok: true });
});
