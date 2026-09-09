import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { askSummaries } from '@/lib/search';

export const dynamic = 'force-dynamic';

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const body = await readJson<{ question?: string; limit?: number }>(request);
  if (!body.question?.trim()) throw new HttpError(400, 'question is required');
  return NextResponse.json(await askSummaries(body.question.trim(), user.id, body.limit ?? 20));
});
