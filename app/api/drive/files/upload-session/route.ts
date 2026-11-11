import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { createResumableUploadSession, getAncestors } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { getArchiveDriveRootId } from '@/lib/archive/folder-rules';

export const dynamic = 'force-dynamic';

/**
 * Start a resumable upload session for a drag-and-dropped file — the
 * browser PUTs the file bytes straight to the returned URL (see
 * createResumableUploadSession), never through this server, so this route
 * only ever handles small JSON bodies regardless of the file's size.
 */
export const POST = handleRoute(async (request: Request) => {
  await requireUser(request);
  const body = await readJson<{ folderId?: string; filename?: string; mimeType?: string }>(request);
  const folderId = body.folderId?.trim();
  const filename = body.filename?.trim();
  if (!folderId) throw new HttpError(400, 'folderId is required');
  if (!filename) throw new HttpError(400, 'filename is required');

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) throw new HttpError(409, 'The archive mailbox is not connected yet.');

  // Never allow uploading outside the archive root, regardless of what folderId a client sends.
  const rootId = await getArchiveDriveRootId(mailboxUser.id);
  if (folderId !== rootId) {
    const ancestors = await getAncestors(mailboxUser.id, folderId);
    if (!ancestors.some((a) => a.id === rootId)) throw new HttpError(403, 'That folder is outside the archive.');
  }

  const uploadUrl = await createResumableUploadSession(mailboxUser.id, {
    name: filename,
    mimeType: body.mimeType?.trim() || 'application/octet-stream',
    parents: [folderId],
  });
  return NextResponse.json({ uploadUrl });
});
