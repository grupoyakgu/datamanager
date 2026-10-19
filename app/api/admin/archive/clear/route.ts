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
 * TESTING ONLY: wipes every archived item (its tag links and comments
 * cascade with it — both have ON DELETE CASCADE on archived_item_id), every
 * file under the Archive Drive root, and any tag that was only ever used by
 * those archive items — e.g. ones auto-created from a sender's inline
 * "tags:a, b" line. A tag still used by a meeting summary is never deleted,
 * since the `tags` table is shared with that module.
 *
 * The Drive side is cleared by walking the actual folder tree
 * (clearFolderContents), not by following DB records — so it also catches
 * files orphaned by e.g. a manual SQL delete of archived_items, which only
 * touches the database. Admin-only, irreversible. Leaves the organizational
 * Drive folders and archive_folder_rules in place.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  const { count: itemCount } = await supabaseAdmin.from('archived_items').select('id', { count: 'exact', head: true });

  // Capture which tags archived items use before the cascade removes those links.
  const { data: tagLinkRows } = await supabaseAdmin.from('archive_item_tags').select('tag_id');
  const archiveTagIds = Array.from(new Set((tagLinkRows ?? []).map((r) => r.tag_id as string)));

  const { error } = await supabaseAdmin.from('archived_items').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);

  let tagsDeleted = 0;
  if (archiveTagIds.length > 0) {
    const { data: stillUsedRows } = await supabaseAdmin.from('meeting_summary_tags').select('tag_id').in('tag_id', archiveTagIds);
    const stillUsed = new Set((stillUsedRows ?? []).map((r) => r.tag_id as string));
    const toDelete = archiveTagIds.filter((id) => !stillUsed.has(id));
    if (toDelete.length > 0) {
      const { error: tagError } = await supabaseAdmin.from('tags').delete().in('id', toDelete);
      if (tagError) console.error('Failed to delete archive-only tags', tagError);
      else tagsDeleted = toDelete.length;
    }
  }

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

  await logAudit(user.id, 'archive.cleared', 'archived_item', 'all', { items: itemCount ?? 0, filesDeleted, tagsDeleted });
  return NextResponse.json({ ok: true, deleted: itemCount ?? 0, filesDeleted, tagsDeleted });
});
