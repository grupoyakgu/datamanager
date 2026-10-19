import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { deleteArchiveItemFromDrive } from '@/lib/archive/drive-export';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * TESTING ONLY: wipes every archived item — its Drive files, tags and
 * comments cascade with it (archive_item_tags / archive_comments both have
 * ON DELETE CASCADE on archived_item_id). Admin-only, irreversible. Leaves
 * the organizational Drive folders and archive_folder_rules in place.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  const { data: items } = await supabaseAdmin.from('archived_items').select('id');
  const ids = (items ?? []).map((i) => i.id as string);

  for (const id of ids) {
    try {
      await deleteArchiveItemFromDrive(id);
    } catch (error) {
      console.error('Failed to delete Drive files for archived item', id, error);
    }
  }

  const { error } = await supabaseAdmin.from('archived_items').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);

  await logAudit(user.id, 'archive.cleared', 'archived_item', 'all', { count: ids.length });
  return NextResponse.json({ ok: true, deleted: ids.length });
});
