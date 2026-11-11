import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { deleteFile } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ fileId: string }> };

/**
 * Delete a raw Drive file shown on the Files page that isn't linked to an
 * archived item — e.g. one an admin uploaded directly to Drive outside the
 * Archive pipeline. A file that IS linked to an archived item is deleted
 * through DELETE /api/archive/[id] instead, which also removes its database
 * row and tags.
 */
export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  if (user.role !== 'admin') throw new HttpError(403, 'Only admins can delete files');
  const { fileId } = await params;

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) throw new HttpError(409, 'The shared archive Drive is not connected yet.');

  await deleteFile(mailboxUser.id, fileId);
  await logAudit(user.id, 'drive.deleted_file', 'drive_file', fileId);
  return NextResponse.json({ ok: true });
});
