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
 * TESTING ONLY, full reset: wipes every archived item (its tag links and
 * comments cascade with it), every file AND subfolder under the Archive
 * Drive root (the root itself is kept, now empty), every archive_folder_rule
 * (their target folders no longer exist), and every tag not used by a
 * meeting summary — a blanket sweep rather than just the tags currently
 * linked to archive items, since a tag can already be orphaned (e.g. from
 * an earlier manual DB cleanup) with no archive_item_tags row left to
 * catch it.
 *
 * The Drive side is cleared by walking the actual folder tree
 * (clearFolderContents), not by following DB records — so it also catches
 * files orphaned by e.g. a manual SQL delete of archived_items, which only
 * touches the database. Admin-only, irreversible.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  const { count: itemCount } = await supabaseAdmin.from('archived_items').select('id', { count: 'exact', head: true });

  const { error } = await supabaseAdmin.from('archived_items').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);

  const { count: rulesCount } = await supabaseAdmin.from('archive_folder_rules').select('id', { count: 'exact', head: true });
  await supabaseAdmin.from('archive_folder_rules').delete().not('id', 'is', null);

  let tagsDeleted = 0;
  const [{ data: usedBySummaries }, { data: allTags }] = await Promise.all([
    supabaseAdmin.from('meeting_summary_tags').select('tag_id'),
    supabaseAdmin.from('tags').select('id'),
  ]);
  const usedIds = new Set((usedBySummaries ?? []).map((r) => r.tag_id as string));
  const toDelete = (allTags ?? []).map((t) => t.id as string).filter((id) => !usedIds.has(id));
  if (toDelete.length > 0) {
    const { error: tagError } = await supabaseAdmin.from('tags').delete().in('id', toDelete);
    if (tagError) console.error('Failed to delete unused tags', tagError);
    else tagsDeleted = toDelete.length;
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

  await logAudit(user.id, 'archive.cleared', 'archived_item', 'all', {
    items: itemCount ?? 0,
    filesDeleted,
    tagsDeleted,
    rulesCleared: rulesCount ?? 0,
  });
  return NextResponse.json({ ok: true, deleted: itemCount ?? 0, filesDeleted, tagsDeleted, rulesCleared: rulesCount ?? 0 });
});
