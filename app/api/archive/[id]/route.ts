import { NextResponse } from 'next/server';
import { handleRoute, HttpError } from '@/lib/http';
import { requireUser, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getArchiveItemById } from '@/lib/archive/repository';
import { deleteArchiveItemFromDrive } from '@/lib/archive/drive-export';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = handleRoute(async (request: Request, { params }: Params) => {
  await requireUser(request);
  const { id } = await params;
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
