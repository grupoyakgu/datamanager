import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getArchiveItemById } from '@/lib/archive/repository';
import { deleteArchiveItemFromDrive } from '@/lib/archive/drive-export';
import { findOrCreateTagsByName } from '@/lib/summaries/repository';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface ArchivePatchBody {
  title?: string;
  tagIds?: string[];
  /** Free-form tag names to create (if they don't already exist) and apply alongside tagIds. */
  newTagNames?: string[];
}

export const GET = handleRoute(async (request: Request, { params }: Params) => {
  await requireUser(request);
  const { id } = await params;
  const item = await getArchiveItemById(id);
  if (!item) throw new HttpError(404, 'Archived item not found');
  return NextResponse.json(item);
});

export const PATCH = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  const body = await readJson<ArchivePatchBody>(request);
  const supabaseAdmin = getSupabaseAdmin();

  const existing = await getArchiveItemById(id);
  if (!existing) throw new HttpError(404, 'Archived item not found');

  const newTitle = body.title?.trim();
  if (newTitle && newTitle !== existing.title) {
    // Drive files are saved under their own original filename, independent
    // of the item's title, so renaming the item never touches Drive.
    const { error } = await supabaseAdmin.from('archived_items').update({ title: newTitle }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  if (Array.isArray(body.tagIds) || Array.isArray(body.newTagNames)) {
    const newTagRows = body.newTagNames?.length ? await findOrCreateTagsByName(body.newTagNames) : [];
    const finalTagIds = Array.from(new Set([...(body.tagIds ?? []), ...newTagRows.map((t) => t.id)]));
    await supabaseAdmin.from('archive_item_tags').delete().eq('archived_item_id', id);
    if (finalTagIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('archive_item_tags')
        .insert(finalTagIds.map((tagId) => ({ archived_item_id: id, tag_id: tagId })));
      if (error) throw new Error(error.message);
    }
  }

  await logAudit(user.id, 'archive.updated', 'archived_item', id, body as Record<string, unknown>);

  const item = await getArchiveItemById(id);
  if (!item) throw new HttpError(404, 'Archived item not found');
  return NextResponse.json(item);
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireUser(request);
  const { id } = await params;
  if (user.role !== 'admin') throw new HttpError(403, 'Only admins can delete archived items');

  try {
    await deleteArchiveItemFromDrive(id);
  } catch (driveError) {
    console.error('Failed to remove Drive files for archived item', id, driveError);
  }

  const { error } = await getSupabaseAdmin().from('archived_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAudit(user.id, 'archive.deleted', 'archived_item', id);
  return NextResponse.json({ ok: true });
});
