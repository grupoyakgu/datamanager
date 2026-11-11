import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { checkResumableUploadStatus } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

const UPLOAD_HOST = 'www.googleapis.com';

/**
 * Checks whether a resumable Drive upload session actually finished —
 * called by the browser after its own direct PUT to that session errored
 * out, since that error can mean the response was merely lost (CORS, a
 * dropped connection after Google already received everything) rather than
 * the upload having actually failed. Done server-side rather than from the
 * browser because a plain server-to-server request isn't subject to CORS.
 */
export const POST = handleRoute(async (request: Request) => {
  await requireUser(request);
  const body = await readJson<{ uploadUrl?: string; totalSize?: number }>(request);
  const uploadUrl = body.uploadUrl?.trim();
  if (!uploadUrl) throw new HttpError(400, 'uploadUrl is required');
  if (typeof body.totalSize !== 'number' || body.totalSize < 0) throw new HttpError(400, 'totalSize is required');

  // The upload session URL is a bearer capability — nothing authenticates
  // this server to it beyond possessing the URL itself — so it's only ever
  // fetched if it actually points at Google's own upload host, never an
  // arbitrary caller-supplied address.
  let parsed: URL;
  try {
    parsed = new URL(uploadUrl);
  } catch {
    throw new HttpError(400, 'uploadUrl is invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.host !== UPLOAD_HOST) throw new HttpError(400, 'uploadUrl is not a Google upload URL');

  const status = await checkResumableUploadStatus(uploadUrl, body.totalSize);
  return NextResponse.json(status);
});
