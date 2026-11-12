import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getFile } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { resolveProjectForFolder } from '@/lib/archive/projects';
import { getArchiveItemById } from '@/lib/archive/repository';

export const dynamic = 'force-dynamic';

/**
 * After the browser finishes PUTting one or more drag-and-dropped files
 * straight to Drive (see /api/drive/files/upload-session), record them as
 * one archived item with those files as its attachments — same data shape
 * as a multi-attachment email — so they get the same project/tags/search
 * treatment. File metadata (name, mime type, size) is always re-read from
 * Drive itself here, never trusted from the client.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const body = await readJson<{ folderId?: string; driveFileIds?: string[] }>(request);
  const folderId = body.folderId?.trim();
  const driveFileIds = (body.driveFileIds ?? []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  if (!folderId) throw new HttpError(400, 'folderId is required');
  if (driveFileIds.length === 0) throw new HttpError(400, 'driveFileIds is required');

  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) throw new HttpError(409, 'The archive mailbox is not connected yet.');

  const destination = await resolveProjectForFolder(mailboxUser.id, folderId);

  const files = await Promise.all(driveFileIds.map((id) => getFile(mailboxUser.id, id)));
  const title = files.length === 1 ? files[0].name : `${files.length} files uploaded`;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: inserted, error } = await supabaseAdmin
    .from('archived_items')
    .insert({
      title,
      subject: title,
      body_text: '',
      source: 'manual',
      is_forward: false,
      original_sender_name: user.name,
      original_sender_email: user.email,
      gmail_message_id: `manual-${randomUUID()}`,
      email_received_at: new Date().toISOString(),
      ingested_by: mailboxUser.id,
      source_trashed: true,
      project_id: destination.projectId,
      drive_folder_name: destination.folderName,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const archivedItemId = inserted.id as string;

  const { error: attachmentError } = await supabaseAdmin.from('archive_attachments').insert(
    files.map((file) => ({
      archived_item_id: archivedItemId,
      gmail_message_id: `manual-${archivedItemId}`,
      gmail_attachment_id: file.id,
      filename: file.name,
      mime_type: file.mimeType,
      size_bytes: file.size ? Number(file.size) : null,
      drive_file_id: file.id,
      drive_synced_at: new Date().toISOString(),
    }))
  );
  if (attachmentError) throw new Error(attachmentError.message);

  // No AI metadata/keyword extraction here, unlike an emailed item — a
  // drag-and-dropped file has no email body for the AI to read in the
  // first place, and more to the point, a manual upload should only ever
  // carry tags the uploader actually added themselves (via the item's tag
  // editor), never AI-suggested ones standing in for them.

  await logAudit(user.id, 'archive.uploaded', 'archived_item', archivedItemId, { files: files.map((f) => f.name) });

  const item = await getArchiveItemById(archivedItemId);
  if (!item) throw new HttpError(500, 'Failed to load the uploaded item');
  return NextResponse.json(item, { status: 201 });
});
