import { NextResponse } from 'next/server';
import { handleRoute, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listArchiveTags } from '@/lib/archive/repository';
import { findSimilarTags } from '@/lib/ai/archive-tag-similarity';

export const dynamic = 'force-dynamic';

/**
 * AI-assisted tag search: given a free-text term, returns existing archive
 * tags related in meaning to it (not just ones that contain it as a
 * substring, which the Files page already filters for client-side) — so
 * searching "money" can surface a "Payments" tag, "lease" can surface
 * "Arras", etc.
 */
export const POST = handleRoute(async (request: Request) => {
  await requireUser(request);
  const body = await readJson<{ query?: string }>(request);
  const query = body.query?.trim();
  if (!query) return NextResponse.json({ tags: [] });

  const allTags = await listArchiveTags();
  const matchedNames = await findSimilarTags(query, allTags.map((t) => t.name));
  const tags = matchedNames.map((name) => allTags.find((t) => t.name === name)).filter((t): t is NonNullable<typeof t> => !!t);
  return NextResponse.json({ tags });
});
