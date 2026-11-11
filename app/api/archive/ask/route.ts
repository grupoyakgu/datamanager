import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listArchiveTags, searchArchiveAttachments } from '@/lib/archive/repository';
import { listArchiveProjects } from '@/lib/archive/projects';
import { parseArchiveQuery } from '@/lib/ai/archive-query-parser';

export const dynamic = 'force-dynamic';

export const POST = handleRoute(async (request: Request) => {
  await requireUser(request);
  const body = await readJson<{ question?: string }>(request);
  if (!body.question?.trim()) throw new HttpError(400, 'question is required');
  const question = body.question.trim();

  const [tags, projects] = await Promise.all([listArchiveTags(), listArchiveProjects()]);
  const interpreted = await parseArchiveQuery(
    question,
    tags.map((t) => t.name),
    projects.map((p) => p.name)
  );
  const tagIds = interpreted.tags.map((name) => tags.find((t) => t.name === name)?.id).filter((id): id is string => !!id);

  const results = await searchArchiveAttachments({
    tagIds,
    projectName: interpreted.projectName,
    senderQuery: interpreted.senderQuery,
    textQuery: interpreted.textQuery,
    dateFrom: interpreted.dateFrom,
    dateTo: interpreted.dateTo,
  });

  return NextResponse.json({ results, interpreted });
});
