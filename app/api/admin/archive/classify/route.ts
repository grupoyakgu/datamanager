import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listClassificationCategories } from '@/lib/archive/classification-categories';
import { classifyArchiveItem } from '@/lib/ai/archive-classification';
import { findOrCreateTagsByName } from '@/lib/summaries/repository';

export const dynamic = 'force-dynamic';

// Kept small enough that one call comfortably finishes within a serverless
// function's time limit even with several AI calls in it; the admin UI
// calls this repeatedly (its own loop) until nothing is left unclassified.
const BATCH_SIZE = 15;

interface UnclassifiedRow {
  id: string;
  subject: string;
  body_text: string;
  original_sender_name: string | null;
  original_sender_email: string | null;
  archive_attachments: { filename: string }[] | null;
}

/**
 * Runs the AI classification scan over archived items that haven't been
 * scanned yet (classified_at IS NULL) — one batch per call, admin-only.
 * Matching categories (see archive_classification_categories) are applied
 * as ordinary tags (archive_item_tags), alongside whatever the sender or
 * uploader already declared, never replacing them. Every item in the
 * batch gets classified_at set regardless of whether anything matched, so
 * a later run only ever picks up items added since the last one.
 */
export const POST = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  const categories = await listClassificationCategories();
  const categoryNames = categories.map((c) => c.name);

  const { data: rows, error } = await supabaseAdmin
    .from('archived_items')
    .select('id, subject, body_text, original_sender_name, original_sender_email, archive_attachments ( filename )')
    .is('classified_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(error.message);

  const items = (rows ?? []) as unknown as UnclassifiedRow[];
  let tagged = 0;

  for (const item of items) {
    // classified_at is always set at the end, success or failure — a
    // persistently-failing item (e.g. consistently blocked content) must
    // not get retried forever and block every later item behind it, since
    // items are picked oldest-first.
    try {
      const matches =
        categoryNames.length > 0
          ? await classifyArchiveItem(categoryNames, {
              subject: item.subject,
              bodyText: item.body_text,
              senderEmail: item.original_sender_email,
              senderName: item.original_sender_name,
              filenames: (item.archive_attachments ?? []).map((a) => a.filename),
            })
          : [];

      if (matches.length > 0) {
        const tagRows = await findOrCreateTagsByName(matches);
        if (tagRows.length > 0) {
          const { error: tagError } = await supabaseAdmin
            .from('archive_item_tags')
            .upsert(
              tagRows.map((tag) => ({ archived_item_id: item.id, tag_id: tag.id })),
              { onConflict: 'archived_item_id,tag_id', ignoreDuplicates: true }
            );
          if (tagError) console.error('Failed to apply classification tags for archived item', item.id, tagError);
          else tagged++;
        }
      }
    } catch (itemError) {
      console.error('Classification failed for archived item', item.id, itemError);
    }
    await supabaseAdmin.from('archived_items').update({ classified_at: new Date().toISOString() }).eq('id', item.id);
  }

  const { count: remaining } = await supabaseAdmin
    .from('archived_items')
    .select('id', { count: 'exact', head: true })
    .is('classified_at', null);

  return NextResponse.json({ processed: items.length, tagged, remaining: remaining ?? 0 });
});
