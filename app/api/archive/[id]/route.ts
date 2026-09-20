import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getArchiveItemById } from '@/lib/archive/repository';
import { deleteArchiveItemFromDrive, renameArchiveDriveFiles } from '@/lib/archive/drive-export';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

interface ArchivePatchBody {
  title?: string;
  tagIds?: string[];
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
    const { error } = await supabaseAdmin.from('archived_items').update({ title: newTitle }).eq('id', id);
    if (error) throw new Error(error.message);
    try {
      await renameArchiveDriveFiles(id, newTitle);
    } catch (driveError) {
      console.error('Failed to rename Drive files for archived item', id, driveError);
    }
  }

  if (Array.isArray(body.tagIds)) {
    await supabaseAdmin.from('archive_item_tags').delete().eq('archived_item_id', id);
    if (body.tagIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('archive_item_tags')
        .insert(body.tagIds.map((tagId) => ({ archived_item_id: id, tag_id: tagId })));
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
