import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Resolving/consuming existing links only — new ones are no longer issued.
 * An email with no "tags:" line is now rejected outright (see
 * ingestArchiveMessage) rather than filed to a "Temp" folder with a link
 * for the sender to assign a project later, so these only serve whatever
 * links were already sent out under that earlier behavior.
 */
export interface ReviewTokenLookup {
  archivedItemId: string;
  title: string;
  subject: string;
}

interface RawReviewTokenRow {
  archived_item_id: string;
  expires_at: string;
  used_at: string | null;
  archived_items: { title: string; subject: string } | { title: string; subject: string }[] | null;
}

/** Resolves a token to its archived item, or null if it doesn't exist, already expired, or was already used. */
export async function resolveReviewToken(token: string): Promise<ReviewTokenLookup | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('archive_review_tokens')
    .select('archived_item_id, expires_at, used_at, archived_items ( title, subject )')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as RawReviewTokenRow;
  if (row.used_at || new Date(row.expires_at) < new Date()) return null;

  const item = Array.isArray(row.archived_items) ? (row.archived_items[0] ?? null) : row.archived_items;
  if (!item) return null;
  return { archivedItemId: row.archived_item_id, title: item.title, subject: item.subject };
}

export async function consumeReviewToken(token: string): Promise<void> {
  await getSupabaseAdmin().from('archive_review_tokens').update({ used_at: new Date().toISOString() }).eq('token', token);
}
