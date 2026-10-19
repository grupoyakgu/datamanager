import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { clearFolderContents } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { getArchiveDriveRootId } from '@/lib/archive/folder-rules';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * TESTING ONLY: wipes every archived item (its tags and comments cascade
 * with it — both have ON DELETE CASCADE on archived_item_id) and every file
 * under the Archive Drive root. The Drive side is cleared by walking the
 * actual folder tree (clearFolderContents), not by following DB records —
 * so it also catches files orphaned by e.g. a manual SQL delete of
 * archived_items, which only touches the database. Admin-only,
 * irreversible. Leaves the organizational Drive folders and
 * archive_folder_rules in place.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  const { count: itemCount } = await supabaseAdmin.from('archived_items').select('id', { count: 'exact', head: true });

  const { error } = await supabaseAdmin.from('archived_items').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);

  let filesDeleted = 0;
  const mailboxUser = await getArchiveMailboxUser();
  if (mailboxUser) {
    try {
      const rootId = await getArchiveDriveRootId(mailboxUser.id);
      filesDeleted = await clearFolderContents(mailboxUser.id, rootId);
    } catch (error) {
      console.error('Failed to clear Archive Drive folder contents', error);
    }
  }

  await logAudit(user.id, 'archive.cleared', 'archived_item', 'all', { items: itemCount ?? 0, filesDeleted });
  return NextResponse.json({ ok: true, deleted: itemCount ?? 0, filesDeleted });
});
