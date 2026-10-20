import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { clearFolderContents } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { getSummariesDriveRootId } from '@/lib/summaries/folder-rules';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * TESTING ONLY, full reset: wipes every summary (its tags, extracted data
 * and attachment rows cascade with it), every file under the Summaries
 * Drive root (the root itself is kept, now empty), and every tag not used
 * by an archived item — a blanket sweep, mirroring the Archive module's own
 * "Clear Archive" button. Admin-only, irreversible.
 */
export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  const { count: summaryCount } = await supabaseAdmin.from('meeting_summaries').select('id', { count: 'exact', head: true });
  const { error } = await supabaseAdmin.from('meeting_summaries').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);

  const { count: rulesCount } = await supabaseAdmin.from('summary_folder_rules').select('id', { count: 'exact', head: true });
  await supabaseAdmin.from('summary_folder_rules').delete().not('id', 'is', null);

  let tagsDeleted = 0;
  const [{ data: usedByArchive }, { data: allTags }] = await Promise.all([
    supabaseAdmin.from('archive_item_tags').select('tag_id'),
    supabaseAdmin.from('tags').select('id'),
  ]);
  const usedIds = new Set((usedByArchive ?? []).map((r) => r.tag_id as string));
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
      const rootId = await getSummariesDriveRootId(mailboxUser.id);
      filesDeleted = await clearFolderContents(mailboxUser.id, rootId);
    } catch (error) {
      console.error('Failed to clear Summaries Drive folder contents', error);
    }
  }

  await logAudit(user.id, 'summaries.cleared', 'meeting_summary', 'all', {
    deleted: summaryCount ?? 0,
    filesDeleted,
    tagsDeleted,
    rulesCleared: rulesCount ?? 0,
  });
  return NextResponse.json({ ok: true, deleted: summaryCount ?? 0, filesDeleted, tagsDeleted, rulesCleared: rulesCount ?? 0 });
});
